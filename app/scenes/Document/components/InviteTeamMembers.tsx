import { t } from "i18next";
import { observer } from "mobx-react";
import * as React from "react";
import { toast } from "sonner";
import styled from "styled-components";
import { DocumentPermission } from "@shared/types";
import Document from "~/models/Document";
import User from "~/models/User";
import UserMembership from "~/models/UserMembership";
import MemberListItem from "~/scenes/CollectionPermissions/components/MemberListItem";
import Flex from "~/components/Flex";
import LoadingIndicator from "~/components/LoadingIndicator";
import PaginatedList from "~/components/PaginatedList";
import Text from "~/components/Text";
import useCurrentUser from "~/hooks/useCurrentUser";
import useRequest from "~/hooks/useRequest";
import useStores from "~/hooks/useStores";
import useThrottledCallback from "~/hooks/useThrottledCallback";
import Combobox from "./Combobox";

type Props = {
  document: Document;
};

function InviteTeamMembers({ document }: Props) {
  const { users, userMemberships } = useStores();
  const [query, setQuery] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState<User | null>(null);
  const user = useCurrentUser();

  const {
    data: teamMembers,
    loading: loadingTeamMembers,
    request: loadTeamMembers,
  } = useRequest(
    React.useCallback(() => users.fetchPage({ limit: 10 }), [users])
  );

  const {
    data: documentMembers,
    loading: loadingDocumentMembers,
    request: loadDocumentMembers,
  } = useRequest(
    React.useCallback(
      () =>
        userMemberships.fetchDocumentMemberships({
          id: document.id,
          limit: 10,
        }),
      [userMemberships, document.id]
    )
  );

  const inviteUser = React.useCallback(
    (user: User) =>
      userMemberships.create({
        documentId: document.id,
        userId: user.id,
        permission: DocumentPermission.ReadWrite,
      }),
    [userMemberships, document.id]
  );

  React.useEffect(() => {
    void loadTeamMembers();
    void loadDocumentMembers();
  }, [loadTeamMembers, loadDocumentMembers]);

  const fetchUsersByQuery = useThrottledCallback(
    (query) =>
      users.fetchPage({
        query,
      }),
    250
  );

  React.useEffect(() => {
    if (query) {
      void fetchUsersByQuery(query);
    }
  }, [query, fetchUsersByQuery]);

  React.useEffect(() => {
    if (selectedUser) {
      void inviteUser(selectedUser);
    }
  }, [selectedUser, inviteUser]);

  const handleQuery = (value: string) => {
    setQuery(value);
  };

  const handleSelect = (user: User) => {
    setSelectedUser(user);
  };

  const handleRemoveUser = React.useCallback(
    async (user) => {
      try {
        await userMemberships.delete({
          documentId: document.id,
          userId: user.id,
        } as UserMembership);
        toast.success(
          t(`{{ userName }} was removed from the document`, {
            userName: user.name,
          })
        );
      } catch (err) {
        toast.error(t("Could not remove user"));
      }
    },
    [userMemberships, document]
  );

  const handleUpdateUser = React.useCallback(
    async (user, permission) => {
      try {
        await userMemberships.create({
          documentId: document.id,
          userId: user.id,
          permission,
        });
        toast.success(
          t(`{{ userName }} permissions were updated`, {
            userName: user.name,
          })
        );
      } catch (err) {
        toast.error(t("Could not update user"));
      }
    },
    [userMemberships, document]
  );

  if (!teamMembers || !documentMembers) {
    return null;
  }

  if (loadingTeamMembers || loadingDocumentMembers) {
    return <LoadingIndicator />;
  }

  return (
    <RelativeFlex column>
      <Combobox
        suggestions={document.uninvitedUsers.map((user) => ({
          ...user,
          value: user.name,
        }))}
        value={query}
        onChangeInput={handleQuery}
        onSelectOption={handleSelect}
        placeholder={`${t("Search by name")}…`}
        label={t("Invite team members")}
        listLabel="Team members"
        flex
        autoFocus
      />
      {document.users.length > 0 ? (
        <Text weight="bold">{t("In this project")}</Text>
      ) : null}
      <PaginatedList
        items={document.users}
        options={{ id: document.id }}
        renderItem={(item: User) => (
          <MemberListItem
            key={item.id}
            user={item}
            membership={item.getMembership(document)}
            canEdit={item.id !== user.id || user.isAdmin}
            onRemove={() => handleRemoveUser(item)}
            onUpdate={(permission) => handleUpdateUser(item, permission)}
            isAdminPermissionSupported={false}
          />
        )}
      />
    </RelativeFlex>
  );
}

const RelativeFlex = styled(Flex)`
  position: relative;
`;

export default observer(InviteTeamMembers);