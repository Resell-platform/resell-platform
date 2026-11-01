import type { Copy } from "../../i18n";
import type { View } from "../../types/app";

export function LoginRequiredPanel({ view, text }: { view: View; text: Copy }) {
  const panelCopy: Record<Exclude<View, "browse">, { eyebrow: string; title: string; body: string }> = {
    sell: {
      eyebrow: text.accountRequired,
      title: text.loginSellTitle,
      body: text.loginSellBody
    },
    orders: {
      eyebrow: text.accountRequired,
      title: text.loginOrdersTitle,
      body: text.loginOrdersBody
    },
    chat: {
      eyebrow: text.accountRequired,
      title: text.loginChatTitle,
      body: text.loginChatBody
    },
    notifications: {
      eyebrow: text.accountRequired,
      title: text.loginAlertsTitle,
      body: text.loginAlertsBody
    }
  };
  const content = panelCopy[view as Exclude<View, "browse">];

  return (
    <section className="workspace">
      <div className="panel login-required">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
      </div>
    </section>
  );
}
