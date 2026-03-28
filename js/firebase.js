// ============================================================
//  NEXUS ARENA — firebase.js
// ============================================================
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyC01z9nk8VIFbUM6pq0nN-Q-abOvjZt67U",
  authDomain:        "nexus-arena-d3b0f.firebaseapp.com",
  projectId:         "nexus-arena-d3b0f",
  storageBucket:     "nexus-arena-d3b0f.firebasestorage.app",
  messagingSenderId: "352353749954",
  appId:             "1:352353749954:web:a26ee299f3413c8fdea45b"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
