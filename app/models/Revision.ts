import { computed } from "mobx";
import { isRTL } from "@shared/utils/rtl";
import User from "./User";
import Model from "./base/Model";
import Relation from "./decorators/Relation";

class Revision extends Model {
  id: string;

  documentId: string;

  /** The document title when the revision was created */
  title: string;

  /** Markdown string of the content when revision was created */
  text: string;

  /** The emoji of the document when the revision was created */
  emoji: string | null;

  /** HTML string representing the revision as a diff from the previous version */
  html: string;

  @Relation(() => User)
  createdBy: User;

  /**
   * Returns the direction of the revision text, either "rtl" or "ltr"
   */
  @computed
  get dir(): "rtl" | "ltr" {
    return this.rtl ? "rtl" : "ltr";
  }

  /**
   * Returns true if the revision text is right-to-left
   */
  @computed
  get rtl() {
    return isRTL(this.title);
  }
}

export default Revision;
