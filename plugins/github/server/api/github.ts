import Router from "koa-router";
import find from "lodash/find";
import { IntegrationService, IntegrationType } from "@shared/types";
import { createContext } from "@server/context";
import apexAuthRedirect from "@server/middlewares/apexAuthRedirect";
import auth from "@server/middlewares/authentication";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import validateWebhook from "@server/middlewares/validateWebhook";
import { IntegrationAuthentication, Integration } from "@server/models";
import { APIContext } from "@server/types";
import { GitHubUtils } from "../../shared/GitHubUtils";
import env from "../env";
import { GitHub } from "../github";
import GitHubWebhookTask from "../tasks/GitHubWebhookTask";
import * as T from "./schema";

const router = new Router();

router.get(
  "github.callback",
  auth({ optional: true }),
  validate(T.GitHubCallbackSchema),
  apexAuthRedirect<T.GitHubCallbackReq>({
    getTeamId: (ctx) => ctx.input.query.state,
    getRedirectPath: (ctx, team) =>
      GitHubUtils.callbackUrl({
        baseUrl: team.url,
        params: ctx.request.querystring,
      }),
    getErrorPath: () => GitHubUtils.errorUrl("unauthenticated"),
  }),
  transaction(),
  async (ctx: APIContext<T.GitHubCallbackReq>) => {
    const {
      code,
      state: teamId,
      error,
      installation_id: installationId,
      setup_action: setupAction,
    } = ctx.input.query;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    if (error) {
      ctx.redirect(GitHubUtils.errorUrl(error));
      return;
    }

    if (setupAction === T.SetupAction.request) {
      ctx.redirect(GitHubUtils.installRequestUrl());
      return;
    }

    const client = await GitHub.authenticateAsUser(code!, teamId);
    const installationsByUser = await client.requestAppInstallations();
    const installation = find(
      installationsByUser,
      (i) => i.id === installationId
    );

    if (!installation) {
      return ctx.redirect(GitHubUtils.errorUrl("unauthenticated"));
    }

    const scopes = Object.entries(installation.permissions).map(
      ([name, permission]) => `${name}:${permission}`
    );

    const authentication = await IntegrationAuthentication.create(
      {
        service: IntegrationService.GitHub,
        userId: user.id,
        teamId: user.teamId,
        scopes,
      },
      { transaction }
    );
    await Integration.createWithCtx(createContext({ user, transaction }), {
      service: IntegrationService.GitHub,
      type: IntegrationType.Embed,
      userId: user.id,
      teamId: user.teamId,
      authenticationId: authentication.id,
      settings: {
        github: {
          installation: {
            id: installationId!,
            account: {
              id: installation.account?.id,
              // @ts-expect-error Property 'login' does not exist on type
              name: installation.account?.login,
              avatarUrl: installation.account?.avatar_url,
            },
          },
        },
      },
    });
    ctx.redirect(GitHubUtils.url);
  }
);

router.post(
  "github.webhooks",
  validateWebhook({
    secretKey: env.GITHUB_WEBHOOK_SECRET!,
    getSignatureFromHeader: (ctx) => {
      const { headers } = ctx.request;
      const signatureHeader = headers["x-hub-signature-256"];
      const signature = Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : signatureHeader;
      return signature?.split("=")[1];
    },
  }),
  async (ctx: APIContext) => {
    const { headers, body } = ctx.request;

    await new GitHubWebhookTask().schedule({
      payload: body,
      headers,
    });

    ctx.status = 202;
  }
);

export default router;
