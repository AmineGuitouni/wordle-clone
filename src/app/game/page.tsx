import GameBoard from "@/components/game/GameBoard";
import { KeyBoardLettersProvider } from "@/components/game/Provider";
import { authOptions } from "@/lib/authOptions";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function GamePage() {
    const session = await getServerSession(authOptions)
    if(!session) return null;

    const colRef = collection(db, "words")
    const q = query(colRef, limit(1), orderBy("createdAt", "desc"))
    const docs = (await getDocs(q)).docs

    if(docs.length === 0){
        throw new Error('No word found')
    }

    const toDaysWord = docs[0].data().word as string

    const col = collection(db, "users-history")
    const qry = query(col, where("userId", "==", session.user.id),orderBy("createdAt", "desc"), limit(1))

    const docsHistory = (await getDocs(qry)).docs
    if(docsHistory.length > 1){
        throw new Error("unexpected error")
    }

    let history:{words:string[], colors:string[], letters:{letter: string, type: "right" | "wrong" | "missPlaced"}[]} = {
        words:[],
        colors:[],
        letters:[]
    }

    if(docsHistory.length === 1 && docsHistory[0].data().toDaysWord === toDaysWord){
        history = docsHistory[0].data() as any
    }

    return (
        <div className="container mx-auto flex flex-col items-center max">
            <div className="py-8">
                <KeyBoardLettersProvider letters={history.letters}>
                    <GameBoard rows={6} columns={5} history={{words:history.words, colors:history.colors}}/>
                </KeyBoardLettersProvider>
            </div>
        </div>
    )
}