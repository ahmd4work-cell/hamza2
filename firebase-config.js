// ==========================================
// firebase-config.js - نسخة مصححة نهائية 100%
// مشروع: ahmd4mobily2026 - متوافق مع opportunities.js
// تم توحيد النسخة على 10.12.5 في كل الملفات
// ==========================================
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSV4hHRE_EWQ7Q4vThpI-7AqDNQh3idg",
  authDomain: "ahmd4mobily2026.firebaseapp.com",
  projectId: "ahmd4mobily2026",
  storageBucket: "ahmd4mobily2026.firebasestorage.app",
  messagingSenderId: "365833229927",
  appId: "1:365833229927:web:49661d5dbbe53295fae6c2",
  measurementId: "G-X3NGD09PLV"
};

// تهيئة آمنة بدون تكرار
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ✅ تصدير db كـ const مسمى + افتراضي ليتوافق مع كل طرق الاستيراد
export const db = getFirestore(app);
export { app };
export default app;

// تفعيل التخزين المؤقت Offline (يحسن الأداء ويمنع فقدان البيانات)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("⚠️ Persistence فشل: تبويب آخر مفتوح");
  } else if (err.code === 'unimplemented') {
    console.warn("⚠️ المتصفح لا يدعم Persistence");
  }
});

console.log("✅ Firebase متصل:", firebaseConfig.projectId);
console.log("✅ Firestore جاهز - نسخة 10.12.5");
