import ScoresTable from "@/components/leaderBoard/leaderBoardTable";
import { getDb, type HistoryDocument, type UserDocument } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export default async function LeaderBoard() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const db = await getDb();
    const docs = await db.collection<HistoryDocument>("users-history").find({
        createdAt: { $gte: startOfDay },
        finishedAt: { $ne: null },
    }).toArray();

    const data = await Promise.all(docs.map(async (docData)=>{
        if (!docData.finishedAt) return null;

        const start = docData.createdAt.getTime();
        const end = docData.finishedAt.getTime();

        const time = end - start
        
        const user = await db.collection<UserDocument>("users").findOne({ _id: docData.userId });
        if (!user) return null;

        return {
            user: {
                name: user.name ?? "User",
                email: user.email ?? "",
                image: user.image ?? undefined,
            },
            tries: docData.words.length,
            time
        }
    }))

    const validData = data.filter((item): item is NonNullable<typeof item> => item !== null);
    validData.sort((a, b) => { 
        return (a.time + (10000 * a.tries)) - (b.time + (10000 * b.tries))
    })

    return (
        <div className="container mx-auto py-8">
            <ScoresTable Data={validData.slice(0, 10)}/>
        </div>
    )
}
