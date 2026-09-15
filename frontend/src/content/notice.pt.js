// Portuguese privacy notice, version 1.1. See ./notice.js for the versioning rule.
//
// `school` blocks are placeholders until each organisation supplies its own —
// controller identity, DPO, legal basis, retention, supervisory authority. They
// render visibly unfinished on purpose, so nothing ships half-filled.
//
// Written for AEVA in **European Portuguese**, not Brazilian: the reader is a
// student in Aveiro. That decision shows in vocabulary and in verb forms
// ("está a fazer", not "está fazendo") throughout.
//
// Portuguese forces gender agreement on participles and adjectives applied to
// the person addressed, and the platform does not know — or ask — a student's
// gender. "Nunca é obrigado" would be wrong for half the readers and
// "obrigado(a)" is worse than either. Every sentence here is built so the
// question never arises: the subject is the system, the school, or an
// impersonal construction.

export const notice = {
  title: 'As suas entrevistas de treino e os seus dados pessoais',
  backLabel: '← Voltar',
  fullBelow: '↓ A versão completa encontra-se abaixo.',
  schoolBlockLabel: 'A preencher pela sua escola',

  headline:
    'O RISE serve para treinar entrevistas de emprego. Não tem qualquer relação com as suas notas na escola.',

  short: [
    { key: 'keep', bold: 'O que guardamos:', text: 'as respostas que escreve, a classificação e os comentários que a IA lhes atribui, e quais as entrevistas realizadas e quando.' },
    { key: 'grades', bold: 'Nada aqui influencia as suas notas.', text: 'Nem as notas, nem a passagem de ano, nem o estágio, nem qualquer comunicação aos encarregados de educação. O seu professor usa isto para o ajudar a treinar, e para mais nada.' },
    { key: 'teacher', bold: 'O seu professor pode ler as suas respostas.', text: 'Aqui desempenha o papel de treinador. Ninguém fora da sua escola lhes tem acesso.' },
    { key: 'ai', bold: 'Uma IA lê e classifica as suas respostas.', text: 'Funciona em servidores em Paris. Por vezes engana-se, e a classificação é apenas uma sugestão para tentar de novo.' },
    { key: 'careful', warn: true, bold: 'Uma coisa a reter:', text: 'escreva sobre o trabalho, não sobre si nem sobre outras pessoas. Não é necessário mencionar a sua saúde, a sua família, a sua religião ou o nome de quem quer que seja para dar uma boa resposta de entrevista.' },
    { key: 'rights', bold: 'Pode pedir', text: 'para ver tudo o que o sistema guarda a seu respeito, para corrigir um erro, ou para apagar tudo — a partir da página da sua conta, ou falando com o seu professor.' },
  ],

  shortSchoolBlock:
    'Somos a <escola>. As questões sobre os seus dados devem ser dirigidas a <encarregado da proteção de dados>. Guardamos as suas respostas durante <período>.',

  sections: [
    {
      id: 'who',
      heading: '1. Quem é responsável pelos seus dados',
      school: 'O responsável pelo tratamento é <denominação legal completa da escola, morada, número de identificação>. O nosso encarregado da proteção de dados é <nome, endereço eletrónico, telefone>.',
      body: [
        'A plataforma é operada em nome da escola pela **Tehnička škola Zrenjanin** (Sérvia), que a administra para as três escolas parceiras ao abrigo de um contrato escrito.',
      ],
    },
    {
      id: 'why',
      heading: '2. Porque tratamos os seus dados, e com que fundamento',
      body: [
        'O RISE faz parte do projeto RISE, financiado pelo Erasmus+ (KA210-VET-778D8F70). Existe para que os alunos do ensino profissional possam treinar uma verdadeira entrevista de emprego na sua área e na sua língua, as vezes que quiserem, e receber comentários úteis de imediato.',
      ],
      callout: 'O objetivo é ajudar a conseguir emprego depois da escola. Não é avaliar ninguém dentro dela.',
      listIntro: 'Utilizamos os seus dados para:',
      list: [
        'realizar a entrevista de treino e guardar o que escreveu;',
        'produzir uma classificação e comentários escritos sobre cada resposta, e um resumo final;',
        'permitir que o seu professor veja as suas respostas e a sua evolução, para o poder orientar;',
        'medir os resultados globais do projeto, para o relatório ao Erasmus+ — usando classificações e números, e não o texto das suas respostas.',
      ],
      school: 'O nosso fundamento jurídico é <artigo 6.º, n.º 1, alínea e) — exercício de funções de interesse público / outro>.',
    },
    {
      id: 'not',
      heading: '3. O que não fazemos com eles',
      list: [
        '**Não os usamos para o avaliar.** Nenhuma classificação, resposta ou comentário da IA contribui para uma nota, para uma decisão de passagem de ano, para a colocação num estágio, para um processo disciplinar ou para qualquer comunicação aos encarregados de educação.',
        'Não os vendemos e não os usamos para publicidade.',
        'Não usamos as suas respostas para treinar o modelo de IA.',
        'Não os entregamos a nenhuma entidade empregadora, em circunstância alguma.',
      ],
      after: [
        'Se alguma escola pretendesse um dia usar estas classificações como parte da avaliação, tratar-se-ia de uma atividade diferente, exigindo uma nova análise e uma nova informação.',
      ],
    },
    {
      id: 'what',
      heading: '4. O que guardamos',
      table: [
        ['A sua conta', 'O seu nome, o seu endereço eletrónico escolar, a sua língua e o seu perfil.'],
        ['As suas entrevistas', 'O cenário, o nível, as datas de início e de fim, e o número da tentativa.'],
        ['As suas respostas', 'Exatamente o que escreveu.'],
        ['Os comentários da IA', 'Uma classificação por critério, uma classificação global, os pontos conseguidos, os pontos a melhorar e uma sugestão de resposta melhorada.'],
      ],
    },
    {
      id: 'dont',
      heading: '5. Não escreva dados pessoais',
      body: [
        'O sistema faz perguntas abertas, por exemplo *«descreva uma situação difícil no trabalho»*. Responda sobre o trabalho.',
        'Não é necessário mencionar a sua saúde, a sua família, a sua religião, as suas origens ou o nome de qualquer pessoa real para dar uma resposta de entrevista sólida — e preferimos não guardar essa informação. Não a pedimos e não temos qualquer motivo para a conservar.',
      ],
    },
    {
      id: 'voice',
      heading: '6. Dizer a resposta em vez de a escrever',
      body: [
        'Se for mais cómodo, pode dizer a resposta em vez de a escrever. A escolha é inteiramente sua: o microfone só funciona durante a gravação, e escrever no teclado funciona exatamente como antes.',
        'Ao utilizar esta função, a gravação é enviada para a **Scaleway, em Paris** — a mesma empresa que faz funcionar a IA, dentro da União Europeia — que a converte em texto e devolve esse texto. **A gravação em si nunca é guardada.** Não fica nos nossos servidores, não é armazenada por nós em lado nenhum, e nunca chega ao seu professor. O que fica guardado é o texto, e apenas depois de o ter lido.',
        'O texto aparece no campo da resposta para poder ser verificado. Por vezes uma palavra fica mal transcrita, sobretudo um termo técnico. **Corrija-o antes de enviar**: o que é classificado é o que envia, e não o que disse.',
      ],
    },
    {
      id: 'who-sees',
      heading: '7. Quem pode ver as suas respostas',
      list: [
        '**Você.**',
        '**Os professores e os orientadores da sua própria escola.** Não os professores das outras escolas parceiras.',
        '**As pessoas que administram a plataforma**, apenas quando é necessário para a manter a funcionar ou para corrigir uma avaria.',
      ],
      after: ['Sempre que um membro do pessoal abre as suas respostas, isso fica registado — quem, e quando.'],
    },
    {
      id: 'helpers',
      heading: '8. Empresas que ajudam a fazer funcionar o serviço',
      table: [
        ['Scaleway', 'Faz funcionar o modelo de IA que lê e classifica as suas respostas, e converte voz em texto caso opte por ditar — Paris, França (UE)'],
        ['Hostinger', 'Faz funcionar os servidores que armazenam os dados e envia as mensagens de correio eletrónico relativas à conta — Frankfurt, Alemanha (UE)'],
      ],
      after: [
        'As suas respostas são tratadas **dentro da União Europeia**. O modelo de IA funciona em Paris e a base de dados está em Frankfurt.',
      ],
    },
    {
      id: 'serbia',
      heading: '9. A Sérvia',
      body: [
        'A plataforma é operada a partir da Sérvia, país situado fora da União Europeia e sem «decisão de adequação» da Comissão Europeia. A lei sérvia de proteção de dados segue de perto o RGPD.',
      ],
      school: 'Apenas para escolas da UE, e só depois de assinadas as cláusulas: as transferências dos seus dados para a entidade operadora na Sérvia estão protegidas pelas cláusulas contratuais-tipo aprovadas pela Comissão Europeia, acompanhadas de uma avaliação dos riscos. Pode ser fornecida uma cópia mediante pedido.',
    },
    {
      id: 'ai',
      heading: '10. Sobre a IA',
      body: [
        'Um modelo de inteligência artificial lê a sua resposta, compara-a com os pontos que uma resposta completa deveria conter, e produz uma classificação e comentários escritos.',
        '**É muitas vezes útil, e por vezes engana-se.** Pode não reconhecer um bom argumento ou avaliar mal a forma como algo foi expresso. As suas classificações não são comparáveis entre áreas diferentes, porque as respostas de referência foram redigidas por pessoas diferentes.',
        'É por isso que nada do que produz conta para o que quer que seja: está ali para dar algo a que reagir, não para julgar ninguém. Se uma classificação parecer injusta, fale com o seu professor — pode analisar a resposta consigo.',
      ],
    },
    {
      id: 'how-long',
      heading: '11. Durante quanto tempo os guardamos',
      school: 'As suas respostas escritas e os comentários da IA são guardados durante <período> após o fim de uma entrevista, sendo depois apagados. As classificações separadas das respostas são guardadas até à conclusão do relatório final do projeto, sendo depois anonimizadas. A sua conta é encerrada no final do ano e apagada <período> mais tarde.',
      body: [
        'Quando algo é apagado, desaparece imediatamente do sistema em produção. As cópias existentes nas nossas salvaguardas são substituídas no prazo de **90 dias**, e servem apenas para repor o serviço após uma avaria.',
        'Uma exceção: o registo de *quem consultou* os seus dados é guardado durante 12 meses, mesmo havendo pedido para apagar tudo o resto. Apagá-lo destruiria a prova de quem teve acesso — que é normalmente aquilo que se quer saber.',
      ],
    },
    {
      id: 'rights',
      heading: '12. Os seus direitos',
      listIntro: 'Pode pedir para:',
      list: [
        '**consultar** tudo o que o sistema guarda a seu respeito, e obter uma cópia;',
        '**corrigir** o que estiver errado;',
        '**apagar** os seus dados;',
        '**limitar** o que fazemos com eles, ou **opor-se** a esse tratamento.',
      ],
      after: ['Use os botões da página da sua conta, ou fale com o seu professor.'],
      // The supervisory authority is named rather than left blank, following
      // the Serbian notice, which names the Commissioner directly. A notice
      // written for one jurisdiction knows its own authority, and a blank here
      // is a blank the school could fill in wrongly.
      school: 'Ou escreva diretamente a <encarregado da proteção de dados>. Respondemos no prazo de um mês. Caso não concorde com a forma como o pedido foi tratado, pode apresentar reclamação junto da CNPD (Comissão Nacional de Proteção de Dados), www.cnpd.pt.',
      afterSchool: [
        'Por vezes não é possível apagar tudo de imediato — por exemplo, quando a escola é obrigada a conservar determinados registos. Nesse caso, será indicado qual a parte em causa, e porquê.',
      ],
    },
    {
      id: 'must',
      heading: '13. É obrigatório utilizar?',
      body: [
        'Não. As entrevistas de treino não fazem parte do programa, e não utilizar a plataforma não tem qualquer consequência escolar.',
        'Não existe qualquer obrigação de escrever sobre assuntos pessoais. Uma resposta curta, sobre o trabalho, é uma resposta perfeitamente boa.',
      ],
    },
    {
      id: 'changes',
      heading: '14. Alterações a esta informação',
      body: [
        'Havendo alguma alteração importante, a nova versão será apresentada no início de sessão seguinte. Cada versão tem data, e fica registado qual foi apresentada.',
      ],
    },
  ],

  useHeading: 'Regras de utilização do RISE',
  useIntro:
    'Estas são as regras da sua escola para a plataforma. Não são um contrato e não há nada para aceitar: descrevem a forma como a ferramenta deve ser utilizada.',
  useRules: [
    'Não partilhe os seus dados de acesso com ninguém.',
    'Escreva sobre o trabalho. Não escreva dados pessoais sobre si, nem o nome ou os contactos de outras pessoas.',
    'Isto é treino. O entrevistador é um computador, não uma entidade empregadora real, e nada do que escreve aqui lhe é enviado.',
    'Os comentários existem para ajudar. Se parecerem errados ou injustos, fale com o seu professor.',
  ],
};
