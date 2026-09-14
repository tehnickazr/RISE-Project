// French privacy notice, version 1.1. See ./notice.js for the versioning rule.
//
// `school` blocks are placeholders until each organisation supplies its own —
// controller identity, DPO, legal basis, retention, supervisory authority. They
// render visibly unfinished on purpose, so nothing ships half-filled.
//
// Written for Lycée Jacques Le Caron. Two constraints shaped the wording:
//
// 1. **No agreement with the reader.** French forces gender agreement on past
//    participles and adjectives applied to the person addressed, and the
//    platform does not know — or ask — a student's gender. "Vous n'êtes jamais
//    obligé(e)" is not acceptable in a notice a fifteen-year-old reads about
//    themselves, and the parenthesis is worse than either choice. Every
//    sentence here is built so the question never arises: the subject is the
//    system, the school, or an impersonal construction.
// 2. **Vous, not tu.** French schools address students as `vous` in written
//    institutional documents, and this is one.

export const notice = {
  title: 'Vos entretiens d’entraînement et vos données personnelles',
  backLabel: '← Retour',
  fullBelow: '↓ La version complète se trouve ci-dessous.',
  schoolBlockLabel: 'À compléter par votre établissement',

  headline:
    'RISE sert à s’entraîner aux entretiens d’embauche. Cela n’a aucun rapport avec vos notes au lycée.',

  short: [
    { key: 'keep', bold: 'Ce que nous conservons :', text: 'les réponses que vous saisissez, la note et les commentaires que l’IA leur attribue, ainsi que la liste des entretiens effectués et leur date.' },
    { key: 'grades', bold: 'Rien ici n’influence vos notes.', text: 'Ni vos notes, ni votre passage en classe supérieure, ni votre stage, ni un compte rendu à vos parents. Votre professeur s’en sert pour vous faire progresser, et à rien d’autre.' },
    { key: 'teacher', bold: 'Votre professeur peut lire vos réponses.', text: 'Il joue ici le rôle d’un entraîneur. Personne en dehors de votre établissement n’y a accès.' },
    { key: 'ai', bold: 'Une IA lit vos réponses et les note.', text: 'Elle fonctionne sur des serveurs à Paris. Elle se trompe parfois, et sa note n’est jamais qu’une invitation à réessayer.' },
    { key: 'careful', warn: true, bold: 'Une chose à retenir :', text: 'parlez du métier, pas de vous ni d’autres personnes. Il n’est pas nécessaire de mentionner votre santé, votre famille, votre religion ou le nom de qui que ce soit pour donner une bonne réponse d’entretien.' },
    { key: 'rights', bold: 'Vous pouvez demander', text: 'à consulter tout ce que le système conserve à votre sujet, à faire corriger une erreur, ou à tout faire supprimer — depuis la page de votre compte, ou en vous adressant à votre professeur.' },
  ],

  shortSchoolBlock:
    'Nous sommes <établissement>. Les questions relatives à vos données sont à adresser à <délégué à la protection des données>. Vos réponses sont conservées pendant <durée>.',

  sections: [
    {
      id: 'who',
      heading: '1. Qui est responsable de vos données',
      school: 'Le responsable de traitement est <raison sociale complète de l’établissement, adresse, numéro d’identification>. Notre délégué à la protection des données est <nom, adresse électronique, téléphone>.',
      body: [
        'La plateforme est exploitée pour le compte de l’établissement par **Tehnička škola Zrenjanin** (Serbie), qui l’administre pour les trois établissements partenaires dans le cadre d’un contrat écrit.',
      ],
    },
    {
      id: 'why',
      heading: '2. Pourquoi nous traitons vos données, et sur quelle base',
      body: [
        'RISE fait partie du projet RISE, financé par Erasmus+ (KA210-VET-778D8F70). Il existe pour que les élèves de l’enseignement professionnel puissent s’entraîner à un véritable entretien d’embauche dans leur métier et dans leur langue, autant de fois qu’ils le souhaitent, et recevoir immédiatement des commentaires utiles.',
      ],
      callout: 'L’objectif est de vous aider à trouver un emploi après le lycée. Il ne s’agit pas de vous évaluer pendant.',
      listIntro: 'Nous utilisons vos données pour :',
      list: [
        'faire fonctionner l’entretien d’entraînement et conserver ce que vous avez écrit ;',
        'produire une note et des commentaires écrits sur chaque réponse, ainsi qu’une synthèse finale ;',
        'permettre à votre professeur de consulter vos réponses et votre progression afin de vous accompagner ;',
        'mesurer les résultats globaux du projet, pour le rapport destiné à Erasmus+ — à partir des notes et des chiffres, et non du texte de vos réponses.',
      ],
      school: 'Notre base légale est <article 6, paragraphe 1, point e) — mission d’intérêt public / autre>.',
    },
    {
      id: 'not',
      heading: '3. Ce que nous n’en faisons pas',
      list: [
        '**Nous ne nous en servons pas pour vous évaluer.** Aucune note, aucune réponse et aucun commentaire de l’IA ne contribue à une note scolaire, à une décision de passage, à une affectation en stage, à une procédure disciplinaire ou à un compte rendu aux parents.',
        'Nous ne les vendons pas et ne les utilisons pas à des fins publicitaires.',
        'Nous n’utilisons pas vos réponses pour entraîner le modèle d’IA.',
        'Nous ne les transmettons à aucun employeur, en aucun cas.',
      ],
      after: [
        'Si un établissement souhaitait un jour utiliser ces notes dans le cadre de l’évaluation scolaire, il s’agirait d’une autre activité, qui exigerait une nouvelle analyse et une nouvelle information.',
      ],
    },
    {
      id: 'what',
      heading: '4. Ce que nous conservons',
      table: [
        ['Votre compte', 'Votre nom, votre adresse électronique scolaire, votre langue et votre rôle.'],
        ['Vos entretiens', 'Le scénario, le niveau, les dates de début et de fin, le numéro de la tentative.'],
        ['Vos réponses', 'Exactement ce que vous avez saisi.'],
        ['Les commentaires de l’IA', 'Une note par critère, une note globale, les points réussis, les points à améliorer et une proposition de meilleure réponse.'],
      ],
    },
    {
      id: 'dont',
      heading: '5. N’écrivez pas de détails personnels',
      body: [
        'Le système pose des questions ouvertes, par exemple *« racontez une situation difficile au travail »*. Répondez à propos du travail.',
        'Il n’est pas nécessaire de mentionner votre santé, votre famille, votre religion, vos origines ou le nom d’une personne réelle pour donner une réponse d’entretien solide — et nous préférons ne pas détenir ces informations. Nous ne les demandons pas et nous n’avons aucune raison de les conserver.',
      ],
    },
    {
      id: 'voice',
      heading: '6. Dicter votre réponse au lieu de la saisir',
      body: [
        'Si cela vous convient mieux, vous pouvez dicter votre réponse au lieu de la saisir au clavier. Le choix vous appartient entièrement : le microphone ne fonctionne que pendant l’enregistrement, et la saisie au clavier fonctionne exactement comme avant.',
        'Lors de l’utilisation de cette fonction, l’enregistrement est transmis à **Scaleway, à Paris** — la même entreprise qui fait fonctionner l’IA, à l’intérieur de l’Union européenne — qui le convertit en texte et renvoie ce texte. **L’enregistrement lui-même n’est jamais conservé.** Il n’est pas gardé sur nos serveurs, il n’est stocké nulle part par nos soins, et il n’est jamais transmis à votre professeur. Ce qui est conservé, c’est le texte, et seulement après que vous l’avez relu.',
        'Le texte apparaît dans le champ de réponse afin que vous puissiez le vérifier. Il arrive qu’un mot soit mal transcrit, en particulier un terme technique. **Corrigez-le avant l’envoi** : ce qui est noté est ce que vous envoyez, et non ce que vous avez prononcé.',
      ],
    },
    {
      id: 'who-sees',
      heading: '7. Qui peut voir vos réponses',
      list: [
        '**Vous.**',
        '**Les professeurs et les conseillers d’orientation de votre propre établissement.** Pas les professeurs des autres établissements partenaires.',
        '**Les personnes qui administrent la plateforme**, uniquement lorsque cela est nécessaire pour la maintenir en état de marche ou corriger une panne.',
      ],
      after: ['Chaque consultation de vos réponses par un membre du personnel est enregistrée — qui, et quand.'],
    },
    {
      id: 'helpers',
      heading: '8. Les entreprises qui nous aident à faire fonctionner le service',
      table: [
        ['Scaleway', 'Fait fonctionner le modèle d’IA qui lit et note vos réponses, et convertit la parole en texte en cas de dictée — Paris, France (UE)'],
        ['Hostinger', 'Fait fonctionner les serveurs qui stockent les données — Francfort, Allemagne (UE)'],
        ['Resend', 'Envoie les courriels liés au compte'],
      ],
      after: [
        'Vos réponses sont traitées **à l’intérieur de l’Union européenne**. Le modèle d’IA fonctionne à Paris et la base de données se trouve à Francfort.',
      ],
    },
    {
      id: 'serbia',
      heading: '9. La Serbie',
      body: [
        'La plateforme est exploitée depuis la Serbie, pays situé hors de l’Union européenne et ne faisant pas l’objet d’une « décision d’adéquation » de la Commission européenne. Le droit serbe de la protection des données est étroitement calqué sur le RGPD.',
      ],
      school: 'Établissements de l’UE uniquement, et seulement une fois les clauses signées : les transferts de vos données vers l’exploitant en Serbie sont encadrés par les clauses contractuelles types approuvées par la Commission européenne, accompagnées d’une analyse des risques. Une copie peut vous en être remise sur demande.',
    },
    {
      id: 'ai',
      heading: '10. À propos de l’IA',
      body: [
        'Un modèle d’intelligence artificielle lit votre réponse, la compare aux éléments qu’une réponse complète devrait contenir, et produit une note ainsi que des commentaires écrits.',
        '**Il est souvent utile, et il se trompe parfois.** Il peut passer à côté d’un bon argument ou mal juger une formulation. Ses notes ne sont pas comparables d’un métier à l’autre, car les réponses de référence ont été rédigées par des personnes différentes.',
        'C’est pourquoi rien de ce qu’il produit ne compte pour quoi que ce soit : il est là pour vous donner matière à réagir, pas pour vous juger. Si une note vous semble injuste, dites-le à votre professeur — il peut examiner votre réponse avec vous.',
      ],
    },
    {
      id: 'how-long',
      heading: '11. Combien de temps nous les conservons',
      school: 'Vos réponses écrites et les commentaires de l’IA sont conservés pendant <durée> après la fin d’un entretien, puis supprimés. Les notes séparées de vos réponses sont conservées jusqu’à l’achèvement du rapport final du projet, après quoi elles sont anonymisées. Votre compte est clôturé à la fin de l’année et supprimé <durée> plus tard.',
      body: [
        'Une donnée supprimée disparaît immédiatement du système en production. Les copies présentes dans nos sauvegardes sont écrasées sous **90 jours**, et ne servent qu’à rétablir le service après une panne.',
        'Une exception : le relevé indiquant *qui a consulté* vos données est conservé 12 mois, même en cas de demande de suppression du reste. Le supprimer détruirait la preuve de qui y a eu accès — ce qui est généralement l’information que l’on souhaite obtenir.',
      ],
    },
    {
      id: 'rights',
      heading: '12. Vos droits',
      listIntro: 'Vous pouvez demander à :',
      list: [
        '**consulter** tout ce que le système conserve à votre sujet, et en obtenir une copie ;',
        '**corriger** ce qui est inexact ;',
        '**supprimer** vos données ;',
        '**limiter** ce que nous en faisons, ou **vous y opposer**.',
      ],
      after: ['Utilisez les boutons de la page de votre compte, ou adressez-vous à votre professeur.'],
      // The supervisory authority is named rather than left blank, following
      // the Serbian notice, which names the Commissioner directly. A notice
      // written for one jurisdiction knows its own authority, and a blank here
      // is a blank the school could fill in wrongly.
      school: 'Vous pouvez aussi écrire directement à <délégué à la protection des données>. Nous répondons dans un délai d’un mois. En cas de désaccord sur la façon dont la demande a été traitée, une réclamation peut être adressée à la CNIL (Commission nationale de l’informatique et des libertés), www.cnil.fr.',
      afterSchool: [
        'Il arrive que tout ne puisse pas être supprimé immédiatement — par exemple lorsque l’établissement est tenu de conserver certains documents. Le cas échéant, nous vous indiquerons quelle partie est concernée, et pourquoi.',
      ],
    },
    {
      id: 'must',
      heading: '13. Faut-il obligatoirement l’utiliser ?',
      body: [
        'Non. Les entretiens d’entraînement ne font pas partie de votre programme, et ne pas utiliser la plateforme n’a aucune conséquence scolaire.',
        'Rien ne vous oblige à écrire quoi que ce soit de personnel. Une réponse courte, portant sur le métier, est une très bonne réponse.',
      ],
    },
    {
      id: 'changes',
      heading: '14. Modifications de cette information',
      body: [
        'En cas de modification importante, la nouvelle version s’affichera à votre prochaine connexion. Chaque version est datée, et nous enregistrons celle qui vous a été présentée.',
      ],
    },
  ],

  useHeading: 'Règles d’utilisation de RISE',
  useIntro:
    'Il s’agit des règles de votre établissement concernant la plateforme. Ce n’est pas un contrat et il n’y a rien à accepter : elles décrivent la façon dont l’outil est censé être utilisé.',
  useRules: [
    'Ne communiquez vos identifiants à personne.',
    'Parlez du métier. N’écrivez pas de détails personnels vous concernant, et n’indiquez ni le nom ni les coordonnées de quiconque.',
    'Il s’agit d’un entraînement. L’examinateur est un ordinateur, pas un véritable employeur, et rien de ce que vous écrivez ici ne lui est transmis.',
    'Les commentaires sont là pour aider. S’ils paraissent erronés ou injustes, dites-le à votre professeur.',
  ],
};
