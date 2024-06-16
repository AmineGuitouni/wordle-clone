import GameBoard from "@/components/game/GameBoard";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";

export default async function GamePage() {
    const colRef = collection(db, "words")
    const q = query(colRef, limit(1), orderBy("createdAt", "desc"))
    const docs = (await getDocs(q)).docs

    if(docs.length === 0){
        return (
            <div className="container mx-auto flex items-center justify-center h-[calc(100vh-6rem)]">
                <div className="text-3xl font-bold">No words found for the moment</div>
            </div>
        )
    }

    const randomWord = docs[0].data().word.toUpperCase()
    return (
        <div className="container mx-auto flex flex-col items-center">
            <div className="pt-12">
                <GameBoard rows={6} columns={5} randomWord={randomWord}/>
            </div>
        </div>
    )
}