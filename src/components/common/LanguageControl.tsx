import type { Copy, Locale } from "../../i18n";

export function LanguageControl({
  locale,
  setLocale,
  text
}: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  text: Copy;
}) {
  return (
    <label className="language-control">
      <span>{text.languageToggle}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </label>
  );
}
