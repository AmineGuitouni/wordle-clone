import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain:  process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app)

type userCred = {
  name: string,
  email: string
  image?: string
}

export async function getUserByID(ID:string){
  try{
    const docRef = doc(db, "users",ID);
    const docCol = await getDoc(docRef)
    const user:userCred | null = docCol ? {...docCol.data()} as userCred : null
    return user
  }catch{
    return null
  }
}