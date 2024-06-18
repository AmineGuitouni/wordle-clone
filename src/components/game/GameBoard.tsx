"use client"
import { useEffect, useState } from "react";
import { ActiveBordRow, StaticBordRow } from "./BordRow";
import { CheckWord } from "@/lib/actions";
import Keyboard from "./keyboard";
import { useKeyBoardLetters } from "./Provider";
export default function GameBoard({
    rows,
    columns,
    history
}:{
    rows: number,
    columns: number,
    history:{
        words:string[],
        colors:string[],
    }
}) {
    const [words, setWords] = useState<string[]>(history.words);
    const [win, setWin] = useState(()=>{
        if(history.words.length > 0){
            return history.colors[history.colors.length - 1] === 'G-G-G-G-G'
        }else{
            return false
        }
    });
    const [waiting, setWaiting] = useState(false);
    const [result, setResult] = useState<string[][]>(history.colors.map(c=>c.split('-')));

    const {AddLetters, setCurrentWord} = useKeyBoardLetters()

    useEffect(()=>{
        if(words.length === 6 && !win){
            console.log("lose")
        }
        else if(win){
            console.log("win")
        }
    },[win,words])

    const addWord = async (word: string) => {
        if(word.length === columns){
            await CheckWord({word}).then(({colors, win, letters})=>{
                setWaiting(true)
                setWords(prev => [...prev, word])
                setResult(prev=>[...prev, colors])
                setCurrentWord("")

                AddLetters(letters)

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
        <div className="w-full">
            <div className="flex flex-col gap-2 w-full items-center"> 
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
            <Keyboard AddWord={addWord}/>
        </div>
    )
}