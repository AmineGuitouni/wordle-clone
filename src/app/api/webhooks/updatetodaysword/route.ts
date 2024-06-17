import { WordsList } from "@/lib/constants";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { NextResponse } from "next/server"

export async function GET(req:Request){
    const key = req.headers.get("key")
    if(!key || key !== process.env.WEBHOOK_SECRET_KEY){
        return NextResponse.json("unauthorized", {status: 401})
    }

    try{
        const colRef = collection(db, "words")
        await addDoc(colRef, {
            word: WordsList[Math.floor(Math.random() * WordsList.length)],
            createdAt: serverTimestamp()
        })

        return NextResponse.json("ok", {status: 200})
    }
    catch(e){
        console.log(e)
        return NextResponse.json("internal server error", {status: 401})
    }
}