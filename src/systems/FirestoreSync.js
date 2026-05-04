import {
  doc, setDoc, updateDoc, collection, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export class FirestoreSync {
  constructor(db) {
    this.db = db;
  }

  async syncUser(user, firebaseUid) {
    if (!firebaseUid) return;
    await setDoc(doc(this.db, "users", firebaseUid), {
      googleId: user.id,
      name: user.name,
      email: user.email,
      lastLogin: serverTimestamp()
    }, { merge: true });
  }

  async syncProgress(firebaseUid, saveData) {
    if (!firebaseUid || !saveData) return;
    await updateDoc(doc(this.db, "users", firebaseUid), {
      currentLevel: saveData.currentLevel ?? 0,
      completedObjectivesCount: saveData.completedObjectives?.length ?? 0,
      upgradePoints: saveData.upgradePoints ?? 0,
      wrongDeliveries: saveData.wrongDeliveries ?? 0
    });
  }

  async getAllUsers() {
    const snap = await getDocs(collection(this.db, "users"));
    return snap.docs.map(d => d.data());
  }
}
