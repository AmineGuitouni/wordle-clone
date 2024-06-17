"use client"
import { useState } from "react";
import { ActiveBordRow, StaticBordRow } from "./BordRow";
import { CheckWord } from "@/lib/actions";
export default function GameBoard({
    rows,
    columns,
    randomWord,
}:{
    rows: number,
    columns: number,
    randomWord: string,
}) {
    const [words, setWords] = useState<string[]>([]);
    const [win, setWin] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [result, setResult] = useState<string[][]>([]);

    if(words.length === 6){
        if(!win){
            // TODO: handle win
        }
        else{
            // TODO: handle lose
        }
    }

    const addWord = async (word: string) => {
        if(word.length === columns){
            setWaiting(true)

            CheckWord({word, encryptedWord: randomWord}).then(({colors, win})=>{
                setWords(prev => [...prev, word])
                setResult(prev=>[...prev, colors])
                console.log("win", win)
                if(win){
                    setWin(true)
                }
                new Promise(resolve => setTimeout(resolve, 1400)).then(
                    () => setWaiting(false)
                )
            }).catch(err=>{
                console.log(err)
                setWaiting(false)
            })
        }
    }

    return(
        <div className="flex flex-col gap-2"> 
            {
                Array.from({ length: rows }, (_, i) => (
                    <div key={i}>
                    {
                        words.length > i ?
                        <StaticBordRow k={i} word={words[i]} result={result[i]} columns={columns}/>:
                        words.length === i && !win && !waiting?
                        <ActiveBordRow k={i} addWord={addWord} columns={columns}/>:
                        <StaticBordRow k={i} columns={columns}/>
                    }
                    </div>
                ))
            }
            <div className="text-center">{win? "you win" : words.length === 6? "you lose" : ""}</div>
        </div>
    )
}