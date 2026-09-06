import GameBoard from "@/components/game/GameBoard";
import { KeyBoardLettersProvider } from "@/components/game/Provider";
import { auth } from "@/auth";
import { getDb, type HistoryDocument, type WordDocument } from "@/lib/mongodb";
import { redirect } from "next/navigation";
 
export const dynamic = "force-dynamic";

export default async function GamePage() {
    const session = await auth()
    if(!session) redirect("/");

    const db = await getDb();
    const todayDocument = await db.collection<WordDocument>("words").findOne({}, { sort: { createdAt: -1 } });

    if(!todayDocument){
        throw new Error('No word found')
    }

    const toDaysWord = todayDocument.word

    const historyDocument = await db.collection<HistoryDocument>("users-history").findOne(
        { userId: session.user.id },
        { sort: { createdAt: -1 } },
    );

    let history:{words:string[], colors:string[], letters:{letter: string, type: "right" | "wrong" | "missPlaced"}[]} = {
        words:[],
        colors:[],
        letters:[]
    }

    if(historyDocument && historyDocument.toDaysWord === toDaysWord){
        history = historyDocument
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
