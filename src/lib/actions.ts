"use server"
import { getServerSession } from "next-auth"
import { WordsList } from "./constants"
import { authOptions } from "./authOptions"
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, FieldValue, where, updateDoc, doc } from "firebase/firestore"
import { db } from "./firebase"

type History ={
    id: string,
    userId:string,
    toDaysWord: string,
    words:string[],
    colors:string[][],
    letters:{letter: string, type: "right" | "wrong" | "missPlaced"}[],
    createdAt: FieldValue,
    finishedAt: FieldValue | null
}

export async function CheckWord({word}:{word: string}){
    const session = await getServerSession(authOptions)
    if(!session || !session.user.id){
        throw new Error('No session found')
    }

    if(!WordsList.includes(word.toLowerCase())){
        throw new Error('Word not found')
    }

    //get todays word
    const colRef = collection(db, "words")
    const q = query(colRef, limit(1), orderBy("createdAt", "desc"))
    const docs = (await getDocs(q)).docs

    if(docs.length === 0){
        throw new Error('No word found')
    }

    const toDaysWord = docs[0].data().word as string

    //get user history
    const col = collection(db, "users-history")
    const qry = query(col, where("userId", "==", session.user.id), orderBy("createdAt", "desc"), limit(1))

    const docsHistory = (await getDocs(qry)).docs
    if(docsHistory.length > 1){
        throw new Error("unexpected error")
    }

    let history : History | null = null

    if(docsHistory.length === 1 && toDaysWord === docsHistory[0].data().toDaysWord){
        history = {...docsHistory[0].data(), id: docsHistory[0].id} as History
    }else{
        const doc = await addDoc(col,{
            words:[],
            colors:[],
            userId: session.user.id,
            toDaysWord: toDaysWord,
            letters:[],
            createdAt: serverTimestamp(),
            finishedAt: null
        })

        history = {
            id:doc.id,
            userId: session.user.id,
            toDaysWord,
            words:[],
            colors:[],
            letters:[],
            createdAt: serverTimestamp(),
            finishedAt: null
        }
    }

    if(!history){
        throw new Error('No history found')
    }

    if(history.words[history.words.length - 1]===toDaysWord){
        throw new Error('Already guessed')
    }
    
    const win = toDaysWord.toUpperCase() === word

    if(win){
        await updateDoc(doc(col, history.id), {
            words: [...history.words, word],
            colors: [...history.colors, ['G', 'G', 'G', 'G', 'G'].join('-')],
            finishedAt: serverTimestamp()
        })
        
        return {colors:['G', 'G', 'G', 'G', 'G'], win, letters:[]}
    }
    
    let colors = ['R', 'R', 'R', 'R', 'R']
    let letters:{letter: string, type: "right" | "wrong" | "missPlaced"}[] = []
    let randomWord = toDaysWord.toUpperCase()

    const userGuess = word

    for (let i = 0; i < 5; i++) {
        if (word[i] === randomWord[i]) {
            letters.push({letter: word[i], type: 'right'})
            colors[i] = 'G'
            randomWord = randomWord.substring(0, i) + '_' + randomWord.substring(i + 1)
            word = word.substring(0, i) + '_' + word.substring(i + 1)
        }
    }

    for (let i = 0; i < 5; i++) {
        if (word[i] !== '_' && randomWord.includes(word[i])) {
            letters.push({letter: word[i], type: 'missPlaced'})
            colors[i] = 'Y'
            randomWord = randomWord.replace(word[i], '_')
            word = word.replace(word[i], '_')
        }
        else if(word[i] !== '_' && !toDaysWord.includes(word[i])) {
            letters.push({letter: word[i], type: 'wrong'})
        }
    }

    await updateDoc(doc(col, history.id), {
        words: [...history.words, userGuess],
        colors: [...history.colors, colors.join('-')],
        letters: [...history.letters, ...letters],
    })
    
    return {colors, win, letters}
}