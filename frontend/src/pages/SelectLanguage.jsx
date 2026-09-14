import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import logo from '../assets/images/Logo_Rise.svg';

export default function SelectLanguage() {
  const { setLanguage } = useAuth();
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const pick = async (lang) => {
    setBusy(true);
    try {
      await setLanguage(lang);
      navigate('/', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <img className="auth-logo" src={logo} alt="RISE" />
        <h1>Choose language / Izaberite jezik</h1>
        <div className="lang-buttons">
          <button onClick={() => pick('sr')} disabled={busy}>Srpski</button>
          <button onClick={() => pick('en')} disabled={busy}>English</button>
          <button onClick={() => pick('fr')} disabled={busy}>Français</button>
          <button onClick={() => pick('pt')} disabled={busy}>Português</button>
        </div>
      </section>
    </main>
  );
}
