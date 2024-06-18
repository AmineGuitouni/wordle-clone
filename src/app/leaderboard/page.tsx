import ScoresTable from "@/components/leaderBoard/leaderBoardTable";
import { db, getUserByID } from "@/lib/firebase";
import { Timestamp, collection, getDocs, limit, query, where } from "firebase/firestore";

export default async function LeaderBoard() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const col = collection(db, "users-history")
    const q = query(col, where('createdAt', '>=', Timestamp.fromDate(startOfDay)), where('finishedAt', '!=', null))

    const docs = (await getDocs(q)).docs
    console.log(docs.length)
    const data = await Promise.all(docs.map(async (d)=>{
        const docData = d.data()
        const start = docData.createdAt.seconds * 1000 + docData.createdAt.nanoseconds / 1000000
        const end = docData.finishedAt.seconds * 1000 + docData.finishedAt.nanoseconds / 1000000

        const time = end - start
        
        const user = (await getUserByID(docData.userId))!

        return {
            user,
            tries: docData.words.length,
            time
        }
    }))

    data.sort((a, b) => { 
        return (a.time + (10000 * a.tries)) - (b.time + (10000 * b.tries))
    })

    return (
        <div className="container mx-auto py-8">
            <ScoresTable Data={data.slice(0, 10)}/>
        </div>
    )
}