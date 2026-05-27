import fs from 'fs';
import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection, setLogLevel } from "firebase/firestore";
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
setLogLevel('error');
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
getDocs(collection(db, "feed")).then(() => {
    console.log("Success");
    process.exit(0);
}).catch(e => {
    console.error(e);
});
