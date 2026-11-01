import type { AppState } from "../../data/types";
import type { Copy } from "../../i18n";

export function UserSwitcher({
  state,
  setState,
  text
}: {
  state: AppState;
  setState: (state: AppState) => void;
  text: Copy;
}) {
  return (
    <label className="user-switcher">
      <span>{text.demoUser}</span>
      <select
        value={state.activeUserId}
        onChange={(event) => setState({ ...state, activeUserId: event.target.value })}
      >
        {state.users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.role === "seller" ? text.sellerRole : text.buyerRole})
          </option>
        ))}
      </select>
    </label>
  );
}
