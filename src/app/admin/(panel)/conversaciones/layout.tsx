import InboxShell from "./InboxShell";
import ConversationList from "./ConversationList";

export default function ConversacionesLayout({ children }: { children: React.ReactNode }) {
  return <InboxShell list={<ConversationList />}>{children}</InboxShell>;
}
