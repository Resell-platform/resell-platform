import type { ReactNode } from "react";

export function NavButton({
  icon,
  label,
  active,
  onClick
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "nav active" : "nav"} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
