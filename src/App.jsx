import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  serverTimestamp,
  query,
updateDoc,
  orderBy
} from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import jsPDF from "jspdf";
import "./style.css";


 const firebaseConfig = {
  apiKey: "AIzaSyB1XxrHtexqS7FKie-SZoB1r4bvIjY28LE",
  authDomain: "scheda-danni-flotta.firebaseapp.com",
  projectId: "scheda-danni-flotta",
  storageBucket: "scheda-danni-flotta.firebasestorage.app",
  messagingSenderId: "643282961080",
  appId: "1:643282961080:web:8923c346710d5524a6aa4d"
};


/*
  Inserisci qui le 4 email Google autorizzate.
  La tua è già inserita; sostituisci le altre tre.
*/
const ALLOWED_USERS = [
  "ceciliab.tdusrl@gmail.com",
  "fleet.tdu@gmail.com",
  "siles.tdu@gmail.com",
  "fabry2979@gmail.com"
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const CLOUD_NAME = "dibm8eiac";
const UPLOAD_PRESET = "p4hwnudm";

const damageTypes = ["Graffio", "Ammaccatura", "Rottura", "Vernice", "Cristallo", "Fanale", "Specchietto", "Cerchio", "Sottoscocca", "Altro"];
const priorities = ["Bassa", "Media", "Alta", "Urgente"];

function cleanPlate(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}

function initialVehicle(plate = "") {
  return {
    targa: cleanPlate(plate),
    flotta: "",
    modello: "",
    tipo: "Furgone",
    stato: "Attivo",
    dataDismissione: "",
    motivoDismissione: ""
  };
}

function initialDamage() {
  return {
    zona: "",
    tipo: "Graffio",
    priorita: "Media",
    descrizione: "",
    data: new Date().toISOString().slice(0, 10),
    responsabile: "",
    km: "",
    stato: "Da valutare",
    assegnatoA: "",
    dataPrevistaRiparazione: "",
    note: "",
    foto: []
  };
}

function Hotspot({ cls, label, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`hotspot ${cls} ${selected === label ? "selected" : ""}`}
      title={label}
      aria-label={label}
      onClick={() => onSelect(label)}
    />
  );
}

function LoginScreen({ onLogin, notAllowedUser }) {
  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Gestione danni flotta</h1>
        <p>Accedi con il tuo account Google aziendale.</p>

        {notAllowedUser && (
          <div className="login-error">
            Account non autorizzato: <b>{notAllowedUser}</b>
          </div>
        )}

        <button onClick={onLogin} className="google-btn">
          Accedi con Google
        </button>
      </div>
    </div>
  );
}

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);
  const [notAllowedUser, setNotAllowedUser] = useState("");

  const [vehicles, setVehicles] = useState([]);
  const [selectedPlate, setSelectedPlate] = useState("");
  const [vehicle, setVehicle] = useState(initialVehicle());
  const [damages, setDamages] = useState([]);
  const [damage, setDamage] = useState(initialDamage());
  const [search, setSearch] = useState("");
  const [newPlate, setNewPlate] = useState("");
  const [viewMode, setViewMode] = useState("attivi");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setAuthReady(true);

      if (!u) {
        setUser(null);
        setNotAllowedUser("");
        return;
      }

      const email = String(u.email || "").toLowerCase();
      const allowed = ALLOWED_USERS.map((x) => x.toLowerCase()).includes(email);

      if (allowed) {
        setUser(u);
        setNotAllowedUser("");
      } else {
        setUser(null);
        setNotAllowedUser(email);
        signOut(auth).catch(() => {});
      }
    });

    return () => unsubscribe();
  }, []);

  async function loginGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      alert("Errore login Google: " + e.message);
    }
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
  }

  async function loadVehicles() {
  const snap = await getDocs(query(collection(db, "mezzi"), orderBy("targa", "asc")));

  const mezzi = await Promise.all(
    snap.docs.map(async (d) => {
      const mezzo = { id: d.id, ...d.data() };

      const danniSnap = await getDocs(
        collection(db, "mezzi", mezzo.targa, "danni")
      );

      const danni = danniSnap.docs.map((x) => ({
        id: x.id,
        ...x.data(),
      }));

      return {
        ...mezzo,
        danni,
        repairCount: danni.filter((x) => x.stato === "Da riparare").length,
      };
    })
  );

  setVehicles(mezzi);
}

  async function openVehicle(plate) {
    const clean = cleanPlate(plate);
    setSelectedPlate(clean);

    const vehicleRef = doc(db, "mezzi", clean);
    const vehicleSnap = await getDoc(vehicleRef);

    if (vehicleSnap.exists()) {
      setVehicle({ ...initialVehicle(clean), ...vehicleSnap.data(), targa: clean });
    } else {
      const newVehicle = initialVehicle(clean);
      await setDoc(vehicleRef, { ...newVehicle, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setVehicle(newVehicle);
    }

    const damageSnap = await getDocs(query(collection(db, "mezzi", clean, "danni"), orderBy("createdAt", "desc")));
    setDamages(damageSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setDamage(initialDamage());
  }

  useEffect(() => {
    if (user) {
      loadVehicles().catch((e) => alert("Errore caricamento mezzi: " + e.message));
    }
  }, [user]);

  function setVehicleField(k, v) {
    if (k === "targa") return;
    setVehicle((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "stato" && v === "Dismesso" && !next.dataDismissione) {
        next.dataDismissione = new Date().toISOString().slice(0, 10);
      }
      return next;
    });
  }

  async function saveVehicleData() {
    if (!selectedPlate) return alert("Seleziona un furgone.");
    setBusy(true);
    try {
      await setDoc(doc(db, "mezzi", selectedPlate), {
        ...vehicle,
        targa: selectedPlate,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await loadVehicles();
      alert("Mezzo salvato.");
    } catch (e) {
      alert("Errore salvataggio mezzo: " + e.message);
    }
    setBusy(false);
  }

  async function addVehicle() {
    const plate = cleanPlate(newPlate);
    if (!plate) return alert("Inserisci una targa.");

    const exists = vehicles.some((v) => v.targa === plate);
    if (exists) {
      setNewPlate("");
      await openVehicle(plate);
      return;
    }

    await setDoc(doc(db, "mezzi", plate), {
      ...initialVehicle(plate),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    setNewPlate("");
    await loadVehicles();
    await openVehicle(plate);
  }

  async function uploadPhotos(files) {
    if (!files || !files.length) return;
    if (!selectedPlate) {
      alert("Seleziona prima un furgone.");
      return;
    }

    setUploading(true);

    try {
      const uploaded = [];

      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("folder", `danni-furgoni/${selectedPlate}`);

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }

        const data = await res.json();

        uploaded.push({
          url: data.secure_url,
          publicId: data.public_id,
          originalName: file.name,
          width: data.width,
          height: data.height,
          bytes: data.bytes,
          uploadedAt: new Date().toISOString()
        });
      }

      setDamage((prev) => ({
        ...prev,
        foto: [...(prev.foto || []), ...uploaded]
      }));
    } catch (e) {
      alert("Errore upload foto Cloudinary: " + e.message);
    }

    setUploading(false);
  }

  function removePhoto(index) {
    setDamage((prev) => ({
      ...prev,
      foto: (prev.foto || []).filter((_, i) => i !== index)
    }));
  }

  async function addDamage() {
    if (!selectedPlate) return alert("Seleziona un furgone.");
    if (!damage.zona) return alert("Seleziona una zona del furgone.");
    if (!damage.descrizione.trim()) return alert("Inserisci una descrizione del danno.");

    setBusy(true);
    try {
      if (damage.id) {
  await updateDoc(doc(db, "mezzi", selectedPlate, "danni", damage.id), {
    ...damage,
    updatedAt: serverTimestamp()
  });
} else {
  await addDoc(collection(db, "mezzi", selectedPlate, "danni"), {
    ...damage,
    targa: selectedPlate,
    vehicleRef: `mezzi/${selectedPlate}`,
    createdByEmail: user?.email || "",
    createdByName: user?.displayName || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

      await openVehicle(selectedPlate);
setDamage(initialDamage());
      alert("Danno salvato e collegato al furgone.");
    } catch (e) {
      alert("Errore salvataggio danno: " + e.message);
    }
    setBusy(false);
  }
async function markAsRepaired(id) {
  const ok = window.confirm("Confermi di voler segnare questo danno come riparato?");

  if (!ok) return;

  await updateDoc(doc(db, "mezzi", selectedPlate, "danni", id), {
    stato: "Risolto",
    repairedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await openVehicle(selectedPlate);
  await loadVehicles();
}
  async function removeDamage(id) {
    if (!confirm("Eliminare questo danno?")) return;
    await deleteDoc(doc(db, "mezzi", selectedPlate, "danni", id));
    await openVehicle(selectedPlate);
  }
function editDamage(d) {
  setDamage({
    ...d,
    id: d.id,
    data: d.data || new Date().toISOString().slice(0, 10),
    foto: d.foto || []
  });

  window.scrollTo({
    top: 500,
    behavior: "smooth"
  });
}  async function imageToBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function exportPDF() {
  if (!selectedPlate) return alert("Seleziona un mezzo.");

  const pdf = new jsPDF();
  let y = 20;

  pdf.setFontSize(18);
  pdf.text(`Scheda danni ${selectedPlate}`, 20, y);
  y += 12;

  pdf.setFontSize(11);
  pdf.text(`Modello: ${vehicle.modello || "-"}`, 20, y); y += 7;
  pdf.text(`Flotta/Sito: ${vehicle.flotta || "-"}`, 20, y); y += 7;
  pdf.text(`Stato mezzo: ${vehicle.stato || "-"}`, 20, y); y += 12;

  for (let i = 0; i < damages.length; i++) {
    const d = damages[i];

    const text =
      `${i + 1}. ${d.data || "-"} | ${d.zona} | ${d.tipo} | ${d.priorita} | ${d.stato}\n` +
      `Responsabile: ${d.responsabile || "-"} | Km: ${d.km || "-"} | Assegnato a: ${d.assegnatoA || "-"}\n` +
      `Descrizione: ${d.descrizione || "-"}`;

    const lines = pdf.splitTextToSize(text, 170);
    pdf.text(lines, 20, y);
    y += lines.length * 6 + 4;

    const photos = d.foto || [];

    for (let p = 0; p < photos.length; p++) {
      try {
        if (y > 220) {
          pdf.addPage();
          y = 20;
        }

        const imgData = await imageToBase64(photos[p].url);
        pdf.addImage(imgData, "JPEG", 20, y, 55, 45);
        y += 50;
      } catch (err) {
        pdf.text("Foto non caricabile nel PDF", 20, y);
        y += 8;
      }
    }

    y += 8;

    if (y > 260) {
      pdf.addPage();
      y = 20;
    }
  }

  pdf.save(`scheda-${selectedPlate}.pdf`);
}
  const activeVehicles = vehicles.filter((v) => v.stato !== "Dismesso");
  const archivedVehicles = vehicles.filter((v) => v.stato === "Dismesso");

  const visibleVehicles = useMemo(() => {
    const base = viewMode === "dismessi" ? archivedVehicles : activeVehicles;
    const q = search.toLowerCase();
    return base.filter((v) =>
      `${v.targa || ""} ${v.flotta || ""} ${v.modello || ""}`.toLowerCase().includes(q)
    );
  }, [vehicles, search, viewMode]);

  const repairDamages = damages.filter((d) => d.stato === "Da riparare");
const resolvedDamages = damages.filter((d) => d.stato === "Risolto");
const totalRepairCount = vehicles.reduce(
  (tot, v) => tot + (v.repairCount || 0),
  0
);
  if (!authReady) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>Caricamento...</h1>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={loginGoogle} notAllowedUser={notAllowedUser} />;
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Furgoni</h2>

        <button className="primary-btn" onClick={() => setDamage(initialDamage())}>+ Nuovo danno</button>

        <input className="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca targa..." />

        <div className="tabs">
          <button className={viewMode === "attivi" ? "active" : ""} onClick={() => setViewMode("attivi")}>Attivi</button>
          <button className={viewMode === "dismessi" ? "active" : ""} onClick={() => setViewMode("dismessi")}>Dismessi</button>
        </div>

        <div className="addrow">
          <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="Nuova targa" />
          <button onClick={addVehicle}>+</button>
        </div>

        <div className="vehicle-list">
          {visibleVehicles.map((v) => (
            <button
  key={v.targa}
  className={`van-item ${
    selectedPlate === v.targa ? "active" : ""
  } ${
    v.repairCount > 0
      ? "has-repair"
      : ""
  }`}
  onClick={() => openVehicle(v.targa)}
>
  <div className="van-top">
    <b>{v.targa}</b>

    {v.repairCount > 0 && (
      <span className="repair-count">
       {v.repairCount}
      </span>
    )}
  </div>

  <span>
    {v.flotta || "Flotta non inserita"} ·{" "}
    {v.modello || "Modello non inserito"}
  </span>
</button>
          ))}
        </div>

        <button className="pdf-btn" onClick={exportPDF}>Esporta PDF</button>
      </aside>

      <main className="main">
{totalRepairCount > 0 && (
  <div className="global-repair-alert">
    ⚠️ Ci sono {totalRepairCount} danni da riparare nella flotta
  </div>
)}
        <div className="topbar">
          <div>
            <h1>Scheda danni furgoni</h1>
            <p>Gestione danni flotta aziendale</p>
          </div>

          <div className="topbar-actions">
            <div className="user-box">
              <span>{user.displayName || user.email}</span>
              <small>{user.email}</small>
            </div>

            <button className="logout-btn" onClick={logout}>Logout</button>

            <button className="save-btn" onClick={saveVehicleData} disabled={busy || !selectedPlate}>
              {busy ? "Salvataggio..." : "Salva mezzo"}
            </button>
          </div>
        </div>

        {selectedPlate && (
          <section className="vehicle-summary">
            <div>
              <label>Targa</label>
              <strong>{selectedPlate}</strong>
            </div>

            <label>Modello
              <input value={vehicle.modello || ""} onChange={(e) => setVehicleField("modello", e.target.value)} placeholder="Modello" />
            </label>

            <label>Flotta / sito
              <input value={vehicle.flotta || ""} onChange={(e) => setVehicleField("flotta", e.target.value)} placeholder="Flotta / sito" />
            </label>

            <label>Stato mezzo
              <select value={vehicle.stato || "Attivo"} onChange={(e) => setVehicleField("stato", e.target.value)}>
                <option>Attivo</option>
                <option>In manutenzione</option>
                <option>Fermo</option>
                <option>Dismesso</option>
              </select>
            </label>
          </section>
        )}

        {vehicle.stato === "Dismesso" && selectedPlate && (
          <section className="archive-box">
            <label>Data dismissione
              <input type="date" value={vehicle.dataDismissione || ""} onChange={(e) => setVehicleField("dataDismissione", e.target.value)} />
            </label>

            <label>Motivo dismissione
              <input value={vehicle.motivoDismissione || ""} onChange={(e) => setVehicleField("motivoDismissione", e.target.value)} placeholder="Restituito, venduto, fine noleggio..." />
            </label>
          </section>
      )} 
        {repairDamages.length > 0 && (
  <div className="repair-alert">
    ⚠️ Ci sono {repairDamages.length} danni da riparare
  </div>
)}
    
<div className="content">
<section className="van-area">
            <h3>Seleziona la zona del danno</h3>

            <div className="mockup-wrapper">
              <img src="/van-map.png" className="mockup" alt="Mappa danni furgone" />

             <Hotspot cls="tetto" label="Tetto" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot
  cls="parabrezza"
  label="Parabrezza"
  selected={damage.zona}
  onSelect={(zona) => setDamage({ ...damage, zona })}
/>

<Hotspot cls="specchio-sx" label="Specchietto retrovisore sinistro" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="specchio-dx" label="Specchietto retrovisore destro" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="porta-ant-sx" label="Porta anteriore sinistra" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="porta-ant-dx" label="Porta anteriore destra" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="porta-carico-laterale-dx" label="Porta di carico laterale destra" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="porta-carico-post" label="Porta di carico posteriore" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="fiancata-sx" label="Fiancata laterale sinistra" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="fiancata-dx" label="Fiancata laterale destra" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="angolare-sx" label="Angolare posteriore sinistro" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="angolare-dx" label="Angolare posteriore destro" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="fanale-sx" label="Fanale posteriore sinistro" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="fanale-dx" label="Fanale posteriore destro" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="paraurti-ant" label="Paraurti anteriore" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="paraurti-post" label="Paraurti posteriore" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />

<Hotspot cls="sottoscocca" label="Sottoscocca" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />
<Hotspot cls="cerchi" label="Cerchi / Pneumatici" selected={damage.zona} onSelect={(zona) => setDamage({ ...damage, zona })} />            </div>

            <div className="photo-section">
              <label className="photo-upload">
                {uploading ? "Caricamento..." : "📷 Aggiungi foto"}
                <input type="file" accept="image/*" multiple onChange={(e) => uploadPhotos(e.target.files)} disabled={uploading} />
              </label>

              <div className="photo-grid">
                {(damage.foto || []).map((p, index) => (
                  <div className="photo-thumb" key={p.url}>
                    <img src={p.url} alt={`Foto danno ${index + 1}`} />
                    <button type="button" onClick={() => removePhoto(index)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="damage-panel">
            <h2>{damage.zona || "Seleziona una zona"}</h2>
            <p className="hint">Clicca una parte del veicolo per segnalare un danno.</p>

            <label>Data segnalazione
              <input type="date" value={damage.data} onChange={(e) => setDamage({ ...damage, data: e.target.value })} />
            </label>

            <label>Responsabile
              <input value={damage.responsabile} onChange={(e) => setDamage({ ...damage, responsabile: e.target.value })} placeholder="Nome responsabile" />
            </label>

            <label>Km
              <input value={damage.km} onChange={(e) => setDamage({ ...damage, km: e.target.value })} placeholder="Km al controllo" />
            </label>

            <label>Tipo danno
              <select value={damage.tipo} onChange={(e) => setDamage({ ...damage, tipo: e.target.value })}>
                {damageTypes.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>

            <label>Priorità
              <select value={damage.priorita} onChange={(e) => setDamage({ ...damage, priorita: e.target.value })}>
                {priorities.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>

            <label>Stato danno
              <select value={damage.stato} onChange={(e) => setDamage({ ...damage, stato: e.target.value })}>
                <option>Da valutare</option>
                <option>Da riparare</option>
                <option>In riparazione</option>
                <option>Risolto</option>
                <option>Archiviato</option>
              </select>
            </label>

            <label>Descrizione
              <textarea value={damage.descrizione} onChange={(e) => setDamage({ ...damage, descrizione: e.target.value })} placeholder="Descrivi il danno..." />
            </label>

            <label>Assegnato a
              <input value={damage.assegnatoA} onChange={(e) => setDamage({ ...damage, assegnatoA: e.target.value })} placeholder="Officina / responsabile" />
            </label>

            <label>Data prevista riparazione
              <input type="date" value={damage.dataPrevistaRiparazione} onChange={(e) => setDamage({ ...damage, dataPrevistaRiparazione: e.target.value })} />
            </label>

            <button className="save-damage" onClick={addDamage} disabled={busy || uploading}>
              {busy ? "Salvataggio..." : "+ Aggiungi danno"}
            </button>
          </aside>
        </div>

        {selectedPlate && (
          <section className="damage-table">
            <h3>Danni da riparare <span>{repairDamages.length}</span></h3>

            <table>
            <thead>
  <tr>
    <th>Data</th>
    <th>Zona</th>
    <th>Tipo</th>
    <th>Descrizione</th>
    <th>Priorità</th>
    <th>Stato</th>
    <th>Responsabile</th>
    <th>Km</th>
    <th>Assegnato a</th>
    <th>Prevista rip.</th>
    <th>Foto</th>
<th>Azioni</th>
  </tr>
</thead>
              <tbody>
               {damages.filter((d) => d.stato !== "Risolto").map((d) => (
                  <tr key={d.id} className={d.stato === "Da riparare" ? "row-repair" : ""}>
                    <td>{d.data || "-"}</td>
                    <td>{d.zona}</td>
                    <td>{d.tipo}</td>
                    <td>{d.descrizione}</td>
                    <td><span className={`badge ${String(d.priorita || "").toLowerCase()}`}>{d.priorita}</span></td>
                    <td>
  <span className={d.stato === "Da riparare" ? "status-repair" : "status-normal"}>
    {d.stato}
  </span>
</td>
		<td>{d.responsabile || "-"}</td>
		<td>{d.km || "-"}</td>
		<td>{d.assegnatoA || "-"}</td>
<td>
  {d.repairedAt?.toDate
    ? d.repairedAt.toDate().toLocaleDateString()
    : "-"}
</td>
		<td>{d.dataPrevistaRiparazione || "-"}</td>
                   <td>
  <div className="mini-photos">
    {(d.foto || []).map((p, i) => (
      <a key={i} href={p.url} target="_blank" rel="noreferrer">
        <img src={p.url} alt="foto danno" />
      </a>
    ))}
  </div>
</td>

<td>
  <button className="repair-btn" onClick={() => markAsRepaired(d.id)}>
    Riparato
  </button>

  <button className="edit-btn" onClick={() => editDamage(d)}>
    Modifica
  </button>

  <button className="delete-btn" onClick={() => removeDamage(d.id)}>
    Elimina
  </button>
</td>
                  </tr>
                ))}
              </tbody>
            </table>
{resolvedDamages.length > 0 && (
  <>
    <h3 className="resolved-title">
      Danni riparati <span>{resolvedDamages.length}</span>
    </h3>

    <table className="resolved-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Zona</th>
          <th>Tipo</th>
          <th>Descrizione</th>
          <th>Priorità</th>
          <th>Responsabile</th>
          <th>Km</th>
          <th>Assegnato a</th>
<th>Data risoluzione</th>
          <th>Foto</th>
        </tr>
      </thead>

      <tbody>
        {resolvedDamages.map((d) => (
          <tr key={d.id}>
            <td>{d.data || "-"}</td>
            <td>{d.zona}</td>
            <td>{d.tipo}</td>
            <td>{d.descrizione}</td>
            <td>{d.priorita}</td>
            <td>{d.responsabile || "-"}</td>
            <td>{d.km || "-"}</td>
            <td>{d.assegnatoA || "-"}</td>
<td>
  {d.repairedAt?.toDate
    ? d.repairedAt.toDate().toLocaleDateString()
    : "-"}
</td>
            <td>
              <div className="mini-photos">
                {(d.foto || []).map((p, i) => (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer">
                    <img src={p.url} alt="foto danno" />
                  </a>
                ))}
              </div>
            </td>
<td>
  <button
    className="danger"
    onClick={() => removeDamage(d.id)}
  >
    Elimina
  </button>
</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
)}
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
