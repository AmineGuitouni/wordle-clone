import { WordsList } from "@/lib/constants";
import { getDb, type WordDocument } from "@/lib/mongodb";
import { NextResponse } from "next/server"

export async function GET(req:Request){
    const key = req.headers.get("key")
    if(!key || key !== process.env.WEBHOOK_SECRET_KEY){
        return NextResponse.json("unauthorized", {status: 401})
    }

    try{
        const db = await getDb();
        await db.collection<WordDocument>("words").insertOne({
            word: WordsList[Math.floor(Math.random() * WordsList.length)],
            createdAt: new Date(),
        });

        return NextResponse.json("ok", {status: 200})
    }
    catch(e){
        console.log(e)
        return NextResponse.json("internal server error", {status: 401})
    }
}
