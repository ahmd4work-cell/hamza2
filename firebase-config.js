// firebase-config.js - نسخة مصححة ومتوافقة مع opportunities.js
// ✅ مهم: يجب أن تكون نفس النسخة 10.8.0 في كل الملفات
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- ضع إعدادات مشروعك هنا (احتفظ بإعداداتك الحالية) ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "ahmd4mobily2026.firebaseapp.com",
  projectId: "ahmd4mobily2026",
  storageBucket: "ahmd4mobily2026.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة التطبيق مرة واحدة فقط
const app = initializeApp(firebaseConfig);

// إنشاء Firestore بنفس نسخة 10.8.0 - هذا هو الإصلاح الأساسي
export const db = getFirestore(app);

// للتأكد
console.log("✅ Firebase متصل:", firebaseConfig.projectId);
console.log("✅ Firestore instance type:", db.constructor.name);
