// Srpska verzija obaveštenja o privatnosti, verzija 1.0. Pravilo o verzijama je
// u ./notice.js.
//
// Formalno obraćanje ("vi") namerno: prati registar ostatka aplikacije, uobičajeno
// je u školskim dokumentima i izbegava rodno slaganje koje u srpskom drugo lice
// jednine nameće.

export const notice = {
  title: 'Vaše vežbe razgovora za posao i vaša privatnost',
  backLabel: '← Nazad',
  fullBelow: '↓ Puna verzija je ispod.',
  schoolBlockLabel: 'Deo koji popunjava škola',

  headline: 'RISE je mesto za vežbanje razgovora za posao. Nema nikakve veze sa vašim ocenama u školi.',

  short: [
    { key: 'keep', bold: 'Šta čuvamo:', text: 'odgovore koje napišete, ocenu i povratnu informaciju koju na njih da veštačka inteligencija, i podatak koje ste razgovore radili i kada.' },
    { key: 'grades', bold: 'Ništa odavde ne utiče na vaše ocene.', text: 'Ni na ocene, ni na prelazak u sledeći razred, ni na praksu, niti se o tome izveštavaju roditelji. Nastavnik ovo koristi da vam pomogne da vežbate — i ni za šta drugo.' },
    { key: 'teacher', bold: 'Vaš nastavnik može da čita vaše odgovore.', text: 'Ovde je u ulozi trenera. Niko izvan vaše škole ne može da ih vidi.' },
    { key: 'ai', bold: 'Odgovore čita i ocenjuje veštačka inteligencija.', text: 'Radi na računarima u Parizu. Ponekad greši, a njena ocena je uvek samo predlog da pokušate ponovo.' },
    { key: 'careful', warn: true, bold: 'Jedna važna stvar:', text: 'pišite o poslu, a ne o sebi ili o drugim ljudima. Da biste dali dobar odgovor na razgovoru, ne morate da pominjete svoje zdravlje, porodicu, veru niti bilo čije ime.' },
    { key: 'rights', bold: 'Možete tražiti', text: 'da vidite sve što sistem čuva o vama, da se ispravi greška ili da se sve obriše — sa stranice svog naloga ili preko nastavnika.' },
  ],

  shortSchoolBlock:
    'Mi smo <škola>. Pitanja o vašim podacima šaljete na <kontakt lica za zaštitu podataka>. Vaše odgovore čuvamo <period>.',

  sections: [
    {
      id: 'who',
      heading: '1. Ko je odgovoran za vaše podatke',
      school: 'Rukovalac podacima je <pun naziv škole, adresa, matični broj>. Naše lice za zaštitu podataka o ličnosti je <ime, mejl, telefon>.',
      body: [
        'Platformu u ime škole održava **Tehnička škola Zrenjanin** (Srbija), koja je vodi za sve tri partnerske škole na osnovu pisanog ugovora.',
      ],
    },
    {
      id: 'why',
      heading: '2. Zašto obrađujemo vaše podatke i po kom osnovu',
      body: [
        'RISE je deo projekta RISE, koji finansira Erazmus+ (KA210-VET-778D8F70). Postoji zato da učenici srednjih stručnih škola mogu da vežbaju pravi razgovor za posao u svojoj struci i na svom jeziku, koliko god puta žele, i da odmah dobiju korisnu povratnu informaciju.',
      ],
      callout: 'Svrha je da vam pomogne da se zaposlite posle škole. Nije da vas ocenjuje u školi.',
      listIntro: 'Vaše podatke koristimo da bismo:',
      list: [
        'vodili vežbu razgovora i sačuvali ono što ste napisali;',
        'napravili ocenu i povratnu informaciju za svaki odgovor, i završni izveštaj;',
        'omogućili nastavniku da vidi vaše odgovore i napredak kako bi mogao da vas vodi;',
        'izmerili da li je projekat uspeo u celini, za izveštaj Erazmusu+ — koristeći ocene i brojeve, a ne ono što ste napisali.',
      ],
      school: 'Naš pravni osnov je <član 6(1)(e) — obavljanje poslova u javnom interesu / drugo>.',
    },
    {
      id: 'not',
      heading: '3. Šta sa njima ne radimo',
      list: [
        '**Ne koristimo ih da vas ocenimo.** Nijedna ocena, odgovor ni komentar veštačke inteligencije ne utiče na školsku ocenu, na prelazak u sledeći razred, na praksu, na disciplinski postupak, niti na izveštaj roditeljima.',
        'Ne prodajemo ih i ne koristimo za reklame.',
        'Ne koristimo vaše odgovore za obučavanje modela veštačke inteligencije.',
        'Ne dajemo ih nijednom poslodavcu, nikada.',
      ],
      after: [
        'Ako bi neka škola htela da ove ocene koristi kao deo ocenjivanja, to bi bila druga aktivnost za koju su potrebni nova procena i novo obaveštenje.',
      ],
    },
    {
      id: 'what',
      heading: '4. Šta čuvamo',
      table: [
        ['Vaš nalog', 'Vaše ime, školsku mejl adresu, jezik i ulogu.'],
        ['Vaše vežbe', 'Koji scenario, koji nivo, kada ste počeli i završili, koji pokušaj.'],
        ['Vaši odgovori', 'Tačno ono što ste napisali.'],
        ['Povratna informacija', 'Ocene po kriterijumima, ukupnu ocenu, šta ste uradili dobro, šta da popravite i predlog boljeg odgovora.'],
      ],
    },
    {
      id: 'dont',
      heading: '5. Molimo vas da ne pišete lične podatke',
      body: [
        'Sistem postavlja otvorena pitanja, na primer *„opišite tešku situaciju na poslu”*. Molimo vas da odgovarate o poslu.',
        'Da biste dali jak odgovor na razgovoru, ne morate da pominjete svoje zdravlje, porodicu, veru, poreklo ni ime bilo koje stvarne osobe — a mi te podatke radije ne bismo ni čuvali. Ne tražimo ih i nemamo razloga da ih zadržimo.',
      ],
    },
    {
      id: 'voice',
      heading: '6. Izgovaranje odgovora umesto kucanja',
      body: [
        'Ako vam je tako lakše, odgovor možete da izgovorite umesto da ga otkucate. To je vaš izbor — mikrofon radi samo dok je dugme uključeno, a kucanje funkcioniše isto kao i do sada.',
        'Kada ga koristite, snimak odlazi kompaniji **Scaleway u Parizu** — istoj koja pokreće veštačku inteligenciju, unutar Evropske unije — koja ga pretvara u tekst i vraća tekst nazad. **Sam snimak se nikada ne čuva.** Ne ostaje na našim serverima, nigde ga ne skladištimo i nikada ne stiže do nastavnika. Čuva se tekst, i to tek pošto ga vidite.',
        'Tekst se pojavljuje u polju za odgovor da biste ga proverili. Ponekad će neku reč pogrešno zapisati, naročito stručnu. **Ispravite ga pre slanja** — ocenjuje se ono što pošaljete, a ne ono što ste izgovorili.',
      ],
    },
    {
      id: 'who-sees',
      heading: '7. Ko može da vidi vaše odgovore',
      list: [
        '**Vi.**',
        '**Nastavnici i savetnici za karijeru u vašoj školi.** Ne i nastavnici iz drugih partnerskih škola.',
        '**Ljudi koji održavaju platformu**, samo kada moraju da bi ona radila ili da bi ispravili kvar.',
      ],
      after: ['Svaki put kada zaposleni otvori vaše odgovore, to se beleži — ko i kada.'],
    },
    {
      id: 'helpers',
      heading: '8. Kompanije koje nam pomažu',
      table: [
        ['Scaleway', 'Pokreće model veštačke inteligencije koji čita i ocenjuje odgovore, a pretvara i govor u tekst ako izaberete diktiranje — Pariz, Francuska (EU)'],
        ['Hostinger', 'Održava servere na kojima se čuvaju podaci i šalje mejlove o nalogu — Frankfurt, Nemačka (EU)'],
      ],
      after: [
        'Vaši odgovori se obrađuju **unutar Evropske unije**. Model radi u Parizu, a baza podataka je u Frankfurtu.',
      ],
    },
    {
      id: 'serbia',
      heading: '9. Srbija',
      body: [
        'Platformom se upravlja iz Srbije, koja je izvan Evropske unije i za koju Evropska komisija nije donela odluku o primerenosti zaštite. Srpski zakon o zaštiti podataka o ličnosti veoma je blizak Opštoj uredbi (GDPR).',
      ],
      school: 'Samo škole iz EU, i tek kada klauzule budu potpisane: prenosi vaših podataka operatoru u Srbiji zaštićeni su standardnim ugovornim klauzulama koje je odobrila Evropska komisija, uz procenu rizika. Kopiju možete tražiti od nas.',
    },
    {
      id: 'ai',
      heading: '10. O veštačkoj inteligenciji',
      body: [
        'Model veštačke inteligencije čita vaš odgovor, upoređuje ga sa onim što potpun odgovor treba da sadrži i pravi ocenu i pisanu povratnu informaciju.',
        '**Često je korisna, a ponekad greši.** Može da promaši dobru poentu ili pogrešno proceni način na koji ste se izrazili. Ocene nisu uporedive između različitih struka, jer su očekivane odgovore pisali različiti ljudi.',
        'Baš zato ništa što ona napravi nema posledice: tu je da vam da nešto na šta ćete reagovati, a ne da vas procenjuje. Ako mislite da je ocena nepravedna, recite nastavniku — može da pogleda vaš odgovor zajedno sa vama.',
      ],
    },
    {
      id: 'how-long',
      heading: '11. Koliko dugo ih čuvamo',
      school: 'Vaše napisane odgovore i povratne informacije čuvamo <period> nakon što završite razgovor, a zatim ih brišemo. Ocene bez vaših odgovora čuvamo do završetka finalnog izveštaja projekta, nakon čega se anonimizuju. Vaš nalog se zatvara na kraju godine i briše <period> kasnije.',
      body: [
        'Kada se nešto obriše, odmah nestaje iz sistema. Kopije u rezervnim kopijama se prepisuju u roku od **90 dana** i koriste se isključivo za oporavak servisa posle kvara.',
        'Jedan izuzetak: podatak o tome *ko je gledao* vaše podatke čuva se 12 meseci čak i ako tražite da se sve ostalo obriše. Brisanjem bismo uništili dokaz o tome ko je imao pristup — a to je obično upravo ono što ljudi žele da znaju.',
      ],
    },
    {
      id: 'rights',
      heading: '12. Vaša prava',
      listIntro: 'Možete tražiti da:',
      list: [
        '**vidite** sve što sistem čuva o vama i dobijete kopiju;',
        '**ispravite** ono što nije tačno;',
        '**obrišete** svoje podatke;',
        '**ograničite** obradu ili joj **prigovorite**.',
      ],
      after: ['Koristite dugmad na stranici svog naloga ili pitajte nastavnika.'],
      school: 'Ili pišite direktno na <kontakt lica za zaštitu podataka>. Odgovaramo u roku od mesec dana. Ako niste zadovoljni time kako smo postupili, možete se obratiti Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti.',
      afterSchool: [
        'Ponekad nećemo moći odmah sve da obrišemo — na primer kada je škola dužna da čuva određenu evidenciju. Ako se to desi, reći ćemo vam koji deo i zašto.',
      ],
    },
    {
      id: 'must',
      heading: '13. Morate li da koristite platformu?',
      body: [
        'Ne. Vežbe razgovora nisu deo nastave, a to što neko ne koristi platformu nema nikakve posledice po ocene.',
        'Nikada niste dužni da pišete o nečemu ličnom. Kratak odgovor o poslu sasvim je dobar odgovor.',
      ],
    },
    {
      id: 'changes',
      heading: '14. Izmene ovog obaveštenja',
      body: [
        'Ako promenimo nešto važno, novu verziju ćete videti pri sledećoj prijavi. Svaka verzija ima datum, a mi beležimo koja vam je prikazana.',
      ],
    },
  ],

  useHeading: 'Pravila korišćenja platforme RISE',
  useIntro:
    'Ovo su pravila vaše škole za korišćenje platforme. Nisu ugovor i nema ničega sa čime treba da se saglasite — to je način na koji je alat zamišljen.',
  useRules: [
    'Nemojte nikome davati svoje podatke za prijavu.',
    'Pišite o poslu. Nemojte pisati lične podatke o sebi niti ime i podatke bilo koje druge osobe.',
    'Ovo je vežba. Sagovornik je računar, a ne pravi poslodavac, i ništa što ovde napišete ne šalje se poslodavcu.',
    'Povratna informacija treba da pomogne. Ako vam deluje pogrešno ili nepravedno, recite nastavniku.',
  ],
};
