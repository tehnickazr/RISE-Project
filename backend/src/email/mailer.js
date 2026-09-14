// Outbound mail. Two transports, one chosen by configuration.
//
// Named for the job rather than the vendor, for the same reason `llm.js` is —
// this file used to be `resend.js`, and a filename carrying a supplier's name
// makes the coupling invisible until the day it has to be undone.
//
// **Why SMTP and not a sending API.** The platform has sent 22 emails in its
// life: an invitation link, and a notice that a data request is waiting. A
// sending service exists to solve deliverability at scale, bounce processing,
// webhooks and analytics, none of which this uses. What it added instead was a
// processor in the United States — Resend is Plus Five Five, Inc. of San
// Francisco, with 22 sub-processors of its own, all American — for the sake of
// delivering a link to one person at a time.
//
// Sending through the school's own mail server removes that transfer where the
// server is the school's, and where it is not (a school on Workspace or
// Microsoft 365) it moves the mail into a relationship the school already
// controls and already has an agreement for, rather than one the platform
// introduced. Either way the platform stops being the party that added it.
//
// **Both transports are kept, deliberately, and the choice is explicit.** The
// project's own domain and mailbox are not bought yet, so production still
// sends through Resend while this code ships alongside it. Switching a live
// service's mail at the same moment as a feature release means two things can
// break and only one explanation gets looked at. `MAIL_TRANSPORT` decides, and
// the choice is logged at first send so it is never something to be guessed at
// from a config file nobody can read without an SSH key.
//
// It also exists so that `EMAIL_FROM` is the school's own address. An email
// asking a fifteen-year-old to click a link and set a password should come from
// somewhere they recognise, not from whichever domain happened to be handy when
// the platform was installed — and a supplier's domain leaves with the supplier.

import nodemailer from 'nodemailer';

const DEFAULT_EXPIRY_HOURS = 72;

export function inviteExpiryHours() {
  const value = Number(process.env.INVITE_EXPIRY_HOURS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EXPIRY_HOURS;
}

export function appOrigin(req) {
  const origin = process.env.APP_ORIGIN || process.env.PUBLIC_APP_ORIGIN;
  if (origin) return origin.replace(/\/+$/, '');
  if (req?.get?.('host')) {
    return `${req.protocol}://${req.get('host')}`;
  }
  return `http://localhost:${process.env.PORT || 3002}`;
}

// The invitation already records the language the teacher chose for this
// person. Sending them an English email and then a Serbian interface was an
// oversight, not a decision.
/**
 * Every sentence the platform sends by email, in four languages.
 *
 * Three messages share this table because they share most of their content:
 * what RISE is, and what this particular person will be doing on it. Writing
 * the role paragraph once and using it in both the invitation and the welcome
 * note is not only less text to translate — it means the description a student
 * is given before they join and the one they are given after cannot drift
 * apart.
 *
 * **The role paragraph is the point of the rewrite.** The invitation used to
 * read, in full, "A RISE administrator invited you to create a RISE account."
 * That tells a fifteen-year-old nothing about what they are being asked to
 * join, and it is a poor thing to receive when the next step is clicking a
 * link and choosing a password.
 */
const MAIL_TEXT = {
  en: {
    dateLocale: 'en-GB',

    // --- shared ---------------------------------------------------------
    hello: (name) => `Hello ${name},`,
    whatIsRise:
      'RISE is a free tool for practising job interviews. Students answer real interview questions for their trade, in their own language, and an AI gives feedback on each answer straight away. It was built for vocational schools as part of an Erasmus+ project.',
    erasmus: 'RISE is part of an Erasmus+ project (KA210-VET-778D8F70).',
    askTeacher: 'Questions about the platform? Ask your teacher.',
    fallback: 'If the button does not work, copy this link into your browser:',

    // What this person will be doing here. Used in the invitation, then again
    // in the welcome note in a shorter form.
    role: {
      student:
        'Here you can practise interviews for your own trade, as many questions as you need, and see what a strong answer would have looked like. Nothing here affects your marks at school — it is practice, and it is there to help you. Your teacher can see your answers so they can coach you.',
      teacher:
        'You will be able to see the practice interviews your students complete, their scores and their progress over time, so you can work on the weak spots with them. It is a coaching tool, not a marking one. You see only the students of your own school.',
      admin:
        'You will manage RISE for your school: inviting teachers and students, choosing which interview content your school uses, and answering data requests. You will not be able to read students’ interview answers — that is deliberate, and only teachers can.',
      super_admin:
        'You will be able to create schools on the platform and invite their administrators. You will have no access to any student’s interview data — there is no screen that shows it.',
    },
    roleShort: {
      student:
        'Choose your trade, pick an interview, and answer the questions in your own words. You get feedback on each answer straight away.',
      teacher:
        'Sign in to see your students’ practice interviews, their scores and their progress, and where to focus your coaching.',
      admin:
        'Sign in to invite teachers and students, choose your school’s interview content, and answer data requests.',
      super_admin: 'Sign in to create schools and invite their administrators.',
    },

    // --- invitation -----------------------------------------------------
    invite: {
      subject: (org) => (org ? `${org} invited you to RISE` : 'You are invited to RISE'),
      heading: 'You are invited to RISE',
      invitedBy: (who, org) =>
        org
          ? `${who} has invited you to create an account for ${org}.`
          : `${who} has invited you to create an account.`,
      cta: 'Create account',
      expires: (when) => `This invitation expires on ${when}.`,
    },

    // --- welcome --------------------------------------------------------
    //
    // Its job is to be the email they find when they go looking for the
    // address of the platform — which is the failure watched during the
    // Serbian testing, where students reopened a spent invitation instead.
    welcome: {
      subject: 'Your RISE account — keep this email to sign in',
      heading: 'Your account is ready',
      created: (org) =>
        org ? `Your RISE account for ${org} has been created.` : 'Your RISE account has been created.',
      keep:
        'Keep this email. The link in your invitation only worked once and will not open again. This is the email to come back to when you want to practise.',
      signInHere: 'Sign in here:',
      yourName: 'Your sign-in name:',
      yourPassword: 'Your password is the one you chose. We do not store it and cannot see it.',
      forgot: 'If you forget your password, use “Forgot password” on the sign-in page, or ask your teacher.',
      cta: 'Sign in',
    },

    // --- password reset -------------------------------------------------
    reset: {
      subject: 'Reset your RISE password',
      heading: 'Reset your password',
      body: 'Someone asked to reset the password for this RISE account. Choose a new one using the button below.',
      cta: 'Choose a new password',
      expires: (when) => `This link stops working on ${when}, and can only be used once.`,
      ignore:
        'If you did not ask for this, you can ignore this email — your password has not changed.',
    },
  },

  sr: {
    dateLocale: 'sr-Latn-RS',
    hello: (name) => `Zdravo ${name},`,
    whatIsRise:
      'RISE je besplatan alat za vežbanje razgovora za posao. Učenici odgovaraju na prava pitanja sa razgovora za svoje zanimanje, na svom jeziku, a veštačka inteligencija odmah daje povratnu informaciju na svaki odgovor. Napravljen je za stručne škole u okviru Erazmus+ projekta.',
    erasmus: 'RISE je deo Erazmus+ projekta (KA210-VET-778D8F70).',
    askTeacher: 'Imate pitanja o platformi? Obratite se nastavniku.',
    fallback: 'Ako dugme ne radi, kopirajte ovaj link u pregledač:',
    role: {
      student:
        'Ovde možete da vežbate razgovore za svoje zanimanje, koliko god pitanja vam treba, i da vidite kako bi izgledao dobar odgovor. Ništa ovde ne utiče na vaše ocene u školi — ovo je vežba i tu je da vam pomogne. Nastavnik vidi vaše odgovore da bi mogao da vas vodi.',
      teacher:
        'Videćete vežbe razgovora koje su vaši učenici uradili, njihove ocene i napredak tokom vremena, pa ćete moći da radite sa njima na slabim tačkama. Ovo je alat za vođenje, ne za ocenjivanje. Vidite samo učenike svoje škole.',
      admin:
        'Vodićete RISE za svoju školu: pozivaćete nastavnike i učenike, birati sadržaj intervjua koji škola koristi i odgovarati na zahteve u vezi sa podacima. Nećete moći da čitate odgovore učenika sa intervjua — to je namerno, i mogu samo nastavnici.',
      super_admin:
        'Moći ćete da otvarate škole na platformi i da pozivate njihove administratore. Nećete imati pristup podacima nijednog učenika sa intervjua — ne postoji ekran koji ih prikazuje.',
    },
    roleShort: {
      student:
        'Izaberite zanimanje, pa intervju, i odgovarajte svojim rečima. Povratnu informaciju na svaki odgovor dobijate odmah.',
      teacher:
        'Prijavite se da vidite vežbe razgovora svojih učenika, njihove ocene i napredak, i gde treba da usmerite rad.',
      admin:
        'Prijavite se da pozovete nastavnike i učenike, izaberete sadržaj intervjua za svoju školu i odgovorite na zahteve u vezi sa podacima.',
      super_admin: 'Prijavite se da otvarate škole i pozivate njihove administratore.',
    },
    invite: {
      subject: (org) => (org ? `${org} vas poziva na RISE` : 'Pozvani ste na RISE'),
      heading: 'Pozvani ste na RISE',
      invitedBy: (who, org) =>
        org ? `${who} vas poziva da napravite nalog za: ${org}.` : `${who} vas poziva da napravite nalog.`,
      cta: 'Napravi nalog',
      expires: (when) => `Ovaj poziv ističe ${when}.`,
    },
    welcome: {
      subject: 'Vaš RISE nalog — sačuvajte ovaj mejl za prijavu',
      heading: 'Vaš nalog je spreman',
      created: (org) => (org ? `Napravljen je vaš RISE nalog za: ${org}.` : 'Napravljen je vaš RISE nalog.'),
      keep:
        'Sačuvajte ovaj mejl. Link iz poziva radio je samo jednom i više se neće otvoriti. Ovo je mejl na koji se vraćate kada želite da vežbate.',
      signInHere: 'Prijavite se ovde:',
      yourName: 'Vaše korisničko ime:',
      yourPassword: 'Lozinka je ona koju ste izabrali. Mi je ne čuvamo i ne možemo da je vidimo.',
      forgot:
        'Ako zaboravite lozinku, upotrebite „Zaboravljena lozinka” na stranici za prijavu ili se obratite nastavniku.',
      cta: 'Prijavi se',
    },
    reset: {
      subject: 'Promena lozinke za RISE',
      heading: 'Promena lozinke',
      body: 'Neko je zatražio promenu lozinke za ovaj RISE nalog. Izaberite novu lozinku pomoću dugmeta ispod.',
      cta: 'Izaberi novu lozinku',
      expires: (when) => `Ovaj link prestaje da važi ${when} i može se upotrebiti samo jednom.`,
      ignore: 'Ako ovo niste tražili, zanemarite ovaj mejl — lozinka nije promenjena.',
    },
  },

  fr: {
    dateLocale: 'fr-FR',
    hello: (name) => `Bonjour ${name},`,
    whatIsRise:
      'RISE est un outil gratuit pour s’entraîner aux entretiens d’embauche. Les élèves répondent à de vraies questions d’entretien pour leur métier, dans leur langue, et une IA commente chaque réponse immédiatement. Il a été conçu pour les lycées professionnels dans le cadre d’un projet Erasmus+.',
    erasmus: 'RISE fait partie d’un projet Erasmus+ (KA210-VET-778D8F70).',
    askTeacher: 'Des questions sur la plateforme ? Adressez-vous à votre professeur.',
    fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
    role: {
      student:
        'Vous pourrez vous entraîner aux entretiens de votre métier, poser autant de questions qu’il vous faut, et voir à quoi aurait ressemblé une bonne réponse. Rien ici n’influence vos notes — c’est un entraînement, fait pour vous aider. Votre professeur voit vos réponses afin de vous accompagner.',
      teacher:
        'Vous pourrez consulter les entretiens d’entraînement de vos élèves, leurs notes et leur progression, afin de travailler avec eux les points faibles. C’est un outil d’accompagnement, pas d’évaluation. Vous ne voyez que les élèves de votre établissement.',
      admin:
        'Vous administrerez RISE pour votre établissement : inviter les professeurs et les élèves, choisir le contenu d’entretien utilisé, et répondre aux demandes relatives aux données. Vous ne pourrez pas lire les réponses des élèves — c’est volontaire, et seuls les professeurs le peuvent.',
      super_admin:
        'Vous pourrez créer des établissements sur la plateforme et inviter leurs administrateurs. Vous n’aurez accès aux données d’entretien d’aucun élève — aucun écran ne les affiche.',
    },
    roleShort: {
      student:
        'Choisissez votre métier, puis un entretien, et répondez avec vos propres mots. Chaque réponse est commentée immédiatement.',
      teacher:
        'Connectez-vous pour consulter les entretiens de vos élèves, leurs notes et leur progression, et voir où concentrer votre accompagnement.',
      admin:
        'Connectez-vous pour inviter des professeurs et des élèves, choisir le contenu d’entretien de votre établissement et répondre aux demandes relatives aux données.',
      super_admin: 'Connectez-vous pour créer des établissements et inviter leurs administrateurs.',
    },
    invite: {
      subject: (org) => (org ? `${org} vous invite sur RISE` : 'Vous êtes invité sur RISE'),
      heading: 'Vous êtes invité sur RISE',
      invitedBy: (who, org) =>
        org ? `${who} vous invite à créer un compte pour ${org}.` : `${who} vous invite à créer un compte.`,
      cta: 'Créer un compte',
      expires: (when) => `Cette invitation expire le ${when}.`,
    },
    welcome: {
      subject: 'Votre compte RISE — conservez ce message pour vous connecter',
      heading: 'Votre compte est prêt',
      created: (org) => (org ? `Votre compte RISE pour ${org} a été créé.` : 'Votre compte RISE a été créé.'),
      keep:
        'Conservez ce message. Le lien de votre invitation n’a fonctionné qu’une fois et ne s’ouvrira plus. C’est à ce message qu’il faut revenir pour vous entraîner.',
      signInHere: 'Connectez-vous ici :',
      yourName: 'Votre identifiant :',
      yourPassword: 'Votre mot de passe est celui que vous avez choisi. Nous ne le conservons pas et ne pouvons pas le voir.',
      forgot:
        'En cas d’oubli du mot de passe, utilisez « Mot de passe oublié » sur la page de connexion, ou adressez-vous à votre professeur.',
      cta: 'Se connecter',
    },
    reset: {
      subject: 'Réinitialiser votre mot de passe RISE',
      heading: 'Réinitialiser le mot de passe',
      body: 'Une réinitialisation du mot de passe a été demandée pour ce compte RISE. Choisissez-en un nouveau avec le bouton ci-dessous.',
      cta: 'Choisir un nouveau mot de passe',
      expires: (when) => `Ce lien cesse de fonctionner le ${when} et ne peut servir qu’une fois.`,
      ignore:
        'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message — le mot de passe n’a pas changé.',
    },
  },

  pt: {
    dateLocale: 'pt-PT',
    hello: (name) => `Olá ${name},`,
    whatIsRise:
      'O RISE é uma ferramenta gratuita para praticar entrevistas de emprego. Os alunos respondem a perguntas reais de entrevista da sua área, na sua língua, e uma IA comenta cada resposta de imediato. Foi criado para escolas profissionais no âmbito de um projeto Erasmus+.',
    erasmus: 'O RISE faz parte de um projeto Erasmus+ (KA210-VET-778D8F70).',
    askTeacher: 'Dúvidas sobre a plataforma? Fale com o seu professor.',
    fallback: 'Se o botão não funcionar, copie esta ligação para o navegador:',
    role: {
      student:
        'Aqui pode praticar entrevistas da sua área, com tantas perguntas quantas precisar, e ver como seria uma boa resposta. Nada aqui influencia as suas notas na escola — isto é prática e existe para o ajudar. O seu professor vê as suas respostas para o poder orientar.',
      teacher:
        'Poderá ver as entrevistas de treino dos seus alunos, as classificações e a evolução ao longo do tempo, para trabalhar com eles os pontos fracos. É uma ferramenta de orientação, não de avaliação. Vê apenas os alunos da sua escola.',
      admin:
        'Vai gerir o RISE na sua escola: convidar professores e alunos, escolher o conteúdo de entrevista utilizado e responder a pedidos relativos a dados. Não poderá ler as respostas dos alunos — é intencional, e apenas os professores podem.',
      super_admin:
        'Poderá criar escolas na plataforma e convidar os respetivos administradores. Não terá acesso aos dados de entrevista de nenhum aluno — não existe qualquer ecrã que os mostre.',
    },
    roleShort: {
      student:
        'Escolha a sua área, depois uma entrevista, e responda por palavras suas. Recebe comentários a cada resposta de imediato.',
      teacher:
        'Inicie sessão para ver as entrevistas de treino dos seus alunos, as classificações e a evolução, e onde concentrar a orientação.',
      admin:
        'Inicie sessão para convidar professores e alunos, escolher o conteúdo de entrevista da sua escola e responder a pedidos relativos a dados.',
      super_admin: 'Inicie sessão para criar escolas e convidar os respetivos administradores.',
    },
    invite: {
      subject: (org) => (org ? `${org} convidou-o para o RISE` : 'Foi convidado para o RISE'),
      heading: 'Foi convidado para o RISE',
      invitedBy: (who, org) =>
        org ? `${who} convidou-o a criar uma conta para ${org}.` : `${who} convidou-o a criar uma conta.`,
      cta: 'Criar conta',
      expires: (when) => `Este convite expira a ${when}.`,
    },
    welcome: {
      subject: 'A sua conta RISE — guarde esta mensagem para iniciar sessão',
      heading: 'A sua conta está pronta',
      created: (org) => (org ? `A sua conta RISE para ${org} foi criada.` : 'A sua conta RISE foi criada.'),
      keep:
        'Guarde esta mensagem. A ligação do convite só funcionou uma vez e não voltará a abrir. É a esta mensagem que deve voltar quando quiser praticar.',
      signInHere: 'Inicie sessão aqui:',
      yourName: 'O seu nome de utilizador:',
      yourPassword: 'A palavra-passe é a que escolheu. Não a guardamos e não a conseguimos ver.',
      forgot:
        'Se esquecer a palavra-passe, use «Esqueceu-se da palavra-passe» na página de início de sessão, ou fale com o seu professor.',
      cta: 'Iniciar sessão',
    },
    reset: {
      subject: 'Repor a sua palavra-passe do RISE',
      heading: 'Repor a palavra-passe',
      body: 'Foi pedida a reposição da palavra-passe desta conta RISE. Escolha uma nova com o botão abaixo.',
      cta: 'Escolher uma nova palavra-passe',
      expires: (when) => `Esta ligação deixa de funcionar a ${when} e só pode ser usada uma vez.`,
      ignore: 'Se não fez este pedido, ignore esta mensagem — a palavra-passe não foi alterada.',
    },
  },
};


/**
 * The SMTP connection, built once and reused.
 *
 * Nodemailer pools connections, which matters less for our volume than the
 * fact that a pool surfaces a bad host or a rejected password on the first
 * send rather than silently on every one.
 *
 * `SMTP_SECURE` defaults from the port rather than being guessed: 465 is
 * implicit TLS, 587 is STARTTLS, and getting the pair the wrong way round is
 * the single most common way an SMTP setup fails with an unhelpful error.
 */
let transport = null;
let announced = false;

/**
 * Which transport is in play.
 *
 * Explicit `MAIL_TRANSPORT` wins, because a host may legitimately carry both
 * sets of credentials — production does today, with SMTP staged and unused —
 * and inferring from "whichever is configured" would silently switch a live
 * service the moment someone added a variable to test something.
 *
 * The inference is only the fallback for a host that has said nothing.
 */
export function mailTransport() {
  const declared = (process.env.MAIL_TRANSPORT ?? '').trim().toLowerCase();
  if (declared === 'smtp' || declared === 'resend') return declared;
  if (process.env.SMTP_HOST) return 'smtp';
  if (process.env.RESEND_API_KEY) return 'resend';
  return 'none';
}

export function mailConfig() {
  const kind = mailTransport();
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const from = process.env.EMAIL_FROM;
  const configured =
    kind === 'smtp' ? Boolean(host && from) : kind === 'resend' ? Boolean(process.env.RESEND_API_KEY && from) : false;
  return { kind, host, port, from, configured };
}

function getTransport() {
  if (transport) return transport;
  const { host, port, configured } = mailConfig();
  if (!configured) {
    throw new Error('SMTP_HOST and EMAIL_FROM are required to send mail');
  }
  transport = nodemailer.createTransport({
    host,
    port,
    // Implicit TLS on 465; STARTTLS upgrade otherwise. Never plaintext to a
    // remote host: the body carries an invitation token that is a credential.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    requireTLS: port !== 465,
    // A server that wants no authentication (a school's internal relay,
    // accepting mail from this host by address) is a legitimate setup, so an
    // absent user is not an error.
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
    pool: true,
    maxConnections: 2,
  });
  return transport;
}

/**
 * Send one message, by whichever transport is configured.
 *
 * Both take the same four fields, so everything above this line is written
 * once. `text` is not optional: a mail with only an HTML part is scored as
 * spam by most filters, and the one message this system sends that must not be
 * filed away is an invitation a student is waiting for.
 */
async function deliver({ to, subject, html, text }) {
  const cfg = mailConfig();

  if (!announced) {
    announced = true;
    console.log(`[mail] sending via ${cfg.kind}${cfg.kind === 'smtp' ? ` (${cfg.host})` : ''} as ${cfg.from}`);
  }

  if (cfg.kind === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('MAIL_TRANSPORT is resend but RESEND_API_KEY is not set');
    if (!cfg.from) throw new Error('EMAIL_FROM is required');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to, subject, html, text }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message ?? data?.error?.message ?? `Resend ${res.status}`);
    }
    return data;
  }

  if (cfg.kind !== 'smtp') {
    throw new Error('No mail transport configured: set SMTP_HOST or RESEND_API_KEY');
  }

  return getTransport().sendMail({ from: cfg.from, to: Array.isArray(to) ? to.join(', ') : to, subject, html, text });
}

/**
 * Verify the SMTP settings without sending anything. Used by scripts.
 *
 * SMTP only — there is nothing to verify for a sending API short of sending,
 * which is the thing this exists to avoid.
 */
export async function verifyMail() {
  if (mailTransport() !== 'smtp') {
    throw new Error(`verifyMail is for SMTP; transport is currently "${mailTransport()}"`);
  }
  return getTransport().verify();
}

/**
 * Close the pool.
 *
 * A pooled transport holds its sockets open, and an open socket is a live
 * handle, so a short script that sends one message **never exits** — it sits
 * there until something kills it, having done its job perfectly. That is
 * harmless in the server, which is meant to stay up, and thoroughly confusing
 * in a script, where it reads as a hang rather than as success.
 *
 * Any script that sends mail should call this when it is done.
 */
export async function closeMail() {
  if (!transport) return;
  transport.close();
  transport = null;
}

/** The language block, falling back to English for anything unrecognised. */
function textFor(language) {
  return MAIL_TEXT[language] ?? MAIL_TEXT.en;
}

/**
 * One layout for every message the platform sends.
 *
 * Three emails built by three hand-written templates drift: one gains a
 * footer, another loses its plain-text part, a third keeps a button style
 * nobody updated. Composing them from the same blocks means a change to how
 * mail looks is one change.
 *
 * `blocks` is an ordered list — a string is a paragraph, `{ button }` is the
 * call to action, `{ strong }` is a paragraph that must not be skim-read, and
 * `{ mono }` is something to be read character by character, like an address
 * or a sign-in name.
 *
 * Every message gets a plain-text part built from the same blocks, because an
 * HTML-only message is scored as spam by most filters and these are the
 * messages that must not be filed away.
 */
function compose({ heading, blocks, footer }) {
  const html = [];
  const plain = [];

  html.push(`<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(heading)}</h1>`);
  plain.push(heading, '');

  for (const block of blocks) {
    if (block == null) continue;
    if (typeof block === 'string') {
      html.push(`<p style="margin:0 0 14px">${escapeHtml(block)}</p>`);
      plain.push(block, '');
    } else if (block.strong) {
      html.push(
        `<p style="margin:0 0 14px;padding:12px 14px;background:#f2f3ff;border-radius:8px;font-weight:600">${escapeHtml(block.strong)}</p>`
      );
      plain.push(block.strong, '');
    } else if (block.mono) {
      html.push(
        `<p style="margin:0 0 6px;color:#424654;font-size:14px">${escapeHtml(block.label)}</p>` +
          `<p style="margin:0 0 14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px">${escapeHtml(block.mono)}</p>`
      );
      plain.push(`${block.label} ${block.mono}`, '');
    } else if (block.button) {
      html.push(
        `<p style="margin:0 0 14px"><a href="${escapeHtml(block.href)}" style="display:inline-block;background:#0040a1;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(block.button)}</a></p>`
      );
      plain.push(`${block.button}: ${block.href}`, '');
    } else if (block.link) {
      // The address in full, as text. A button is useless the moment the mail
      // is read somewhere it cannot be clicked — a different phone, a printout,
      // a forwarded copy — and this is the line someone types by hand.
      html.push(
        `<p style="margin:0 0 6px;color:#424654;font-size:14px">${escapeHtml(block.label)}</p>` +
          `<p style="margin:0 0 14px;font-size:17px;font-weight:700"><a href="${escapeHtml(block.link)}" style="color:#0040a1">${escapeHtml(block.link)}</a></p>`
      );
      plain.push(`${block.label} ${block.link}`, '');
    }
  }

  if (footer) {
    html.push(
      `<hr style="border:0;border-top:1px solid #e3e5ef;margin:22px 0 14px">` +
        `<p style="margin:0;color:#737785;font-size:13px">${escapeHtml(footer)}</p>`
    );
    plain.push('---', footer);
  }

  return {
    html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#131b2e;max-width:560px">${html.join('')}</div>`,
    text: plain.join('\n').trim(),
  };
}

/**
 * Invite someone to create an account.
 *
 * `invitedBy` is the inviter's actual name, and that matters more than it
 * looks: this is an email asking a minor to click a link and choose a
 * password, and the name of a teacher they know is the strongest signal we can
 * give that it is genuine. It used to be the literal string "A RISE
 * administrator", which is the kind of thing a phishing message says.
 */
export async function sendInviteEmail({
  to,
  displayName,
  invitedBy,
  role,
  orgName,
  inviteUrl,
  expiresAt,
  language,
}) {
  const t = textFor(language);
  const expires = new Date(expiresAt).toLocaleString(t.dateLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const { html, text } = compose({
    heading: t.invite.heading,
    blocks: [
      t.hello(displayName),
      t.invite.invitedBy(invitedBy, orgName),
      t.whatIsRise,
      t.role[role] ?? t.role.student,
      { button: t.invite.cta, href: inviteUrl },
      t.invite.expires(expires),
      t.fallback,
      { label: '', link: inviteUrl },
    ],
    footer: t.erasmus,
  });

  return deliver({ to, subject: t.invite.subject(orgName), html, text });
}

/**
 * The email someone keeps.
 *
 * Sent once the account exists, and carrying no token, because its whole job
 * is to still work in three months. Students in the Serbian testing could not
 * remember the address of the platform, so they reopened the invitation email
 * and clicked a link that had already been spent — and had nowhere to go from
 * the page it left them on.
 *
 * The sign-in name is in here for the same reason and is the part that matters
 * most for October: the cohort's accounts are pseudonymous, addressed like
 * `student.22okt.1@rise.local`, and **nobody can guess that**. Held only in a
 * dead invitation, it is a locked door.
 */
export async function sendWelcomeEmail({ to, displayName, role, orgName, signInUrl, language }) {
  const t = textFor(language);

  const { html, text } = compose({
    heading: t.welcome.heading,
    blocks: [
      t.hello(displayName),
      t.welcome.created(orgName),
      { strong: t.welcome.keep },
      { label: t.welcome.signInHere, link: signInUrl },
      { label: t.welcome.yourName, mono: to },
      t.welcome.yourPassword,
      t.roleShort[role] ?? t.roleShort.student,
      t.welcome.forgot,
      { button: t.welcome.cta, href: signInUrl },
      role === 'student' ? t.askTeacher : null,
    ],
    footer: t.erasmus,
  });

  return deliver({ to, subject: t.welcome.subject, html, text });
}

/** A one-time link to choose a new password. */
export async function sendPasswordResetEmail({ to, displayName, resetUrl, expiresAt, language }) {
  const t = textFor(language);
  const expires = new Date(expiresAt).toLocaleString(t.dateLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const { html, text } = compose({
    heading: t.reset.heading,
    blocks: [
      t.hello(displayName),
      t.reset.body,
      { button: t.reset.cta, href: resetUrl },
      t.reset.expires(expires),
      // Said plainly, because the commonest reader of this message is someone
      // who did not ask for it and is briefly alarmed.
      t.reset.ignore,
      t.fallback,
      { label: '', link: resetUrl },
    ],
    footer: t.erasmus,
  });

  return deliver({ to, subject: t.reset.subject, html, text });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Tell the administrators that a data request is waiting.
 *
 * Deliberately thin: who asked, what they asked for, when it is due, and a link
 * to the queue. No answers, no scores, no feedback. Emailing a student's
 * transcript to notify someone about a privacy request would be its own small
 * disaster, and mail is the one channel in this system that leaves the EU.
 *
 * The request row is the record; this is a nudge. A failure here is logged and
 * swallowed by the caller — losing the nudge is survivable, losing the request
 * is not.
 */
export async function sendDataRequestEmail({ user, kind, dueAt, req }) {
  const to = (process.env.DATA_REQUEST_NOTIFY || '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  if (to.length === 0) throw new Error('DATA_REQUEST_NOTIFY is not set — nobody would be told');

  const what = kind === 'erasure' ? 'deletion of their data' : 'a copy of their data';
  const due = new Date(dueAt).toLocaleDateString('en', { dateStyle: 'medium' });
  const url = `${appOrigin(req)}/admin`;

  return deliver({
    to,
    subject: `RISE: a data request is waiting (due ${due})`,
    html: `
        <div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#131b2e">
          <h1 style="font-size:20px;margin:0 0 16px">A data request is waiting</h1>
          <p><strong>${escapeHtml(user.display_name ?? user.email)}</strong> has asked for
          ${escapeHtml(what)}.</p>
          <p>You have until <strong>${escapeHtml(due)}</strong> to reply.</p>
          <p><a href="${escapeHtml(url)}">Open the admin page</a> to handle it.</p>
          <p style="color:#424654;font-size:13px">This message deliberately contains no interview
          answers or scores.</p>
        </div>`,
    text: `${user.display_name ?? user.email} has asked for ${what}.

You have until ${due} to reply.

Open the admin page to handle it: ${url}

This message deliberately contains no interview answers or scores.`,
  });
}
