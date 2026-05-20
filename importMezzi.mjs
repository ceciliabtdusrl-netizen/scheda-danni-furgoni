import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB1xxrHtexqS7FKie-SZoB1r4bvIjY28LE",
  authDomain: "scheda-danni-flotta.firebaseapp.com",
  projectId: "scheda-danni-flotta",
  storageBucket: "scheda-danni-flotta.firebasestorage.app",
  messagingSenderId: "643282961080",
  appId: "1:643282961080:web:8923c346710d5524a6aa4d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function cleanPlate(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

const raw = fs.readFileSync("./data/mezzi_import.json", "utf8");
const mezzi = JSON.parse(raw);

let imported = 0;

for (const mezzo of mezzi) {
  const targa = cleanPlate(mezzo.targa);
  if (!targa) continue;

  await setDoc(
    doc(db, "mezzi", targa),
    {
      targa,
      flotta: mezzo.flotta || "",
      modello: mezzo.modello || "",
      marca: mezzo.marca || "",
      tipo: mezzo.tipo || "Furgone",
      stato: mezzo.stato || "Attivo",
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    },
    { merge: true }
  );

  imported++;
  console.log(`Importato ${imported}: ${targa}`);
}

console.log(`Import completato. Mezzi importati: ${imported}`);