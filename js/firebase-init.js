// js/firebase-init.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDL1PQxLvegvTEz5G_X57VRChvInRF2SM8",
  authDomain: "ecotrack-491fc.firebaseapp.com",
  projectId: "ecotrack-491fc",
  storageBucket: "ecotrack-491fc.firebasestorage.app",
  messagingSenderId: "837620180668",
  appId: "1:837620180668:web:a3753f36534f8b4c6892b9"
};

// ADDED "export" HERE!
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);