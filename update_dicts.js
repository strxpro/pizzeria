const fs = require('fs');

const files = [
  'src/lib/i18n/dicts/de.ts',
  'src/lib/i18n/dicts/en.ts',
  'src/lib/i18n/dicts/es.ts',
  'src/lib/i18n/dicts/fr.ts',
  'src/lib/i18n/dicts/it.ts',
  'src/lib/i18n/dicts/pl.ts'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  
  if (file.endsWith('pl.ts')) {
    content = content.replace(/in_preparazione: \{.*\},/, 'accettato: { short: "Zaakceptowane", title: "Zamówienie zaakceptowane", text: "Zaczynamy przygotowywać Twoje zamówienie." },');
    content = content.replace(/in_forno: \{.*\},\n/, '');
    content = content.replace(/in_consegna: \{.*\},/, 'in_viaggio: { short: "W drodze", title: "Pizza jedzie do Ciebie!", text: "Dostawca jest w drodze." },');
  } else if (file.endsWith('it.ts')) {
    content = content.replace(/in_preparazione: \{.*\},/, 'accettato: { short: "Accettato", title: "Ordine accettato", text: "Iniziamo a preparare il tuo ordine." },');
    content = content.replace(/in_forno: \{.*\},\n/, '');
    content = content.replace(/in_consegna: \{.*\},/, 'in_viaggio: { short: "In viaggio", title: "La tua pizza è partita!", text: "Il rider è per strada." },');
  } else if (file.endsWith('en.ts')) {
    content = content.replace(/in_preparazione: \{.*\},/, 'accettato: { short: "Accepted", title: "Order accepted", text: "We are starting to prepare your order." },');
    content = content.replace(/in_forno: \{.*\},\n/, '');
    content = content.replace(/in_consegna: \{.*\},/, 'in_viaggio: { short: "On the way", title: "Your pizza is on the way!", text: "The rider is on the road." },');
  } else if (file.endsWith('es.ts')) {
    content = content.replace(/in_preparazione: \{.*\},/, 'accettato: { short: "Aceptado", title: "Pedido aceptado", text: "Empezamos a preparar tu pedido." },');
    content = content.replace(/in_forno: \{.*\},\n/, '');
    content = content.replace(/in_consegna: \{.*\},/, 'in_viaggio: { short: "En camino", title: "¡Tu pizza está en camino!", text: "El repartidor está en la calle." },');
  } else if (file.endsWith('fr.ts')) {
    content = content.replace(/in_preparazione: \{.*\},/, 'accettato: { short: "Accepté", title: "Commande acceptée", text: "Nous commençons à préparer votre commande." },');
    content = content.replace(/in_forno: \{.*\},\n/, '');
    content = content.replace(/in_consegna: \{.*\},/, 'in_viaggio: { short: "En route", title: "Votre pizza est en route !", text: "Le livreur est en chemin." },');
  } else if (file.endsWith('de.ts')) {
    content = content.replace(/in_preparazione: \{.*\},/, 'accettato: { short: "Akzeptiert", title: "Bestellung akzeptiert", text: "Wir beginnen mit der Zubereitung." },');
    content = content.replace(/in_forno: \{.*\},\n/, '');
    content = content.replace(/in_consegna: \{.*\},/, 'in_viaggio: { short: "Unterwegs", title: "Deine Pizza ist unterwegs!", text: "Der Fahrer ist auf dem Weg." },');
  }
  
  fs.writeFileSync(file, content);
}

