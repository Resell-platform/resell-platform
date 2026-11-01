import { useEffect, useState } from "react";
import { Download, UserRound } from "lucide-react";
import type { AppState, User } from "../../data/types";
import type { Copy } from "../../i18n";
import type { LoginAdapter } from "../../platform/adapters";

export function AccountPanel({
  className,
  user,
  message,
  text,
  loginAdapter,
  onMessage,
  onExport,
  onAuthenticated,
  onProfileUpdated,
  onLogout
}: {
  className?: string;
  user: User | null;
  message: string;
  text: Copy;
  loginAdapter: LoginAdapter;
  onMessage: (message: string) => void;
  onExport: () => void;
  onAuthenticated: (user: User, state: AppState) => void;
  onProfileUpdated: (user: User, state: AppState) => void;
  onLogout: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [pickupArea, setPickupArea] = useState(user?.pickupArea ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [profileOpen, setProfileOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setProfileName(user?.name ?? "");
    setPickupArea(user?.pickupArea ?? "");
    setBio(user?.bio ?? "");
    setProfileOpen(false);
  }, [user]);

  async function requestCode() {
    setPending(true);
    try {
      const result = await loginAdapter.requestEmailCode(email, displayName);
      setEmail(result.email);
      if (result.verificationCode) {
        setCode(result.verificationCode);
        onMessage(`${text.developmentCode} ${result.verificationCode}`);
      } else {
        onMessage(text.checkEmail);
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : text.requestCodeFailed);
    } finally {
      setPending(false);
    }
  }

  async function verifyCode() {
    setPending(true);
    try {
      const result = await loginAdapter.verifyEmailCode(email, code, displayName);
      onAuthenticated(result.user, result.state);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : text.verifyCodeFailed);
    } finally {
      setPending(false);
    }
  }

  async function saveProfile() {
    setPending(true);
    try {
      const result = await loginAdapter.updateProfile({
        displayName: profileName,
        pickupArea,
        bio
      });
      onProfileUpdated(result.user, result.state);
      onMessage(text.profileSaved);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : text.profileSaveFailed);
    } finally {
      setPending(false);
    }
  }

  if (!user) {
    return (
      <section className={`account-panel ${className ?? ""}`.trim()}>
        <div className="account-heading">
          <UserRound size={18} />
          <strong>{text.loginOrCreate}</strong>
        </div>
        <p>{text.noPassword}</p>
        {message && <p className="account-message">{message}</p>}
        <label>
          <span>{text.displayName}</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label>
          <span>{text.email}</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="secondary" disabled={pending || !email.trim()} onClick={requestCode}>
          {text.sendLoginCode}
        </button>
        <label>
          <span>{text.verificationCode}</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button className="primary" disabled={pending || !email.trim() || !code.trim()} onClick={verifyCode}>
          {text.logIn}
        </button>
      </section>
    );
  }

  return (
    <section className={`account-panel signed-in ${className ?? ""}`.trim()}>
      <div className="account-summary">
        <div className="account-heading">
          <UserRound size={18} />
          <div>
            <strong>{user.name}</strong>
            <span>{text.emailVerified}</span>
          </div>
        </div>
        <button className="ghost-inline" type="button" onClick={() => setProfileOpen((open) => !open)}>
          {profileOpen ? text.collapseProfile : text.editProfile}
        </button>
      </div>
      {message && <p className="account-message">{message}</p>}
      {profileOpen && (
        <div className="account-profile">
          <label>
            <span>{text.displayName}</span>
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <label>
            <span>{text.pickupArea}</span>
            <input value={pickupArea} onChange={(event) => setPickupArea(event.target.value)} />
          </label>
          <label>
            <span>{text.bio}</span>
            <textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />
          </label>
          <button className="secondary" disabled={pending || !profileName.trim()} onClick={saveProfile}>
            {text.saveProfile}
          </button>
        </div>
      )}
      <div className="account-actions">
        <button className="secondary" disabled={pending} onClick={onExport}>
          <Download size={16} />
          {text.dataExport}
        </button>
        <button className="ghost account-logout" disabled={pending} onClick={onLogout}>
          {text.logOut}
        </button>
      </div>
    </section>
  );
}
