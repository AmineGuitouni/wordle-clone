"use client"

import { WordsList } from "@/lib/constants";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { useKeyBoardLetters } from "./Provider";

export function ActiveBordRow({addWord, k, columns}: {addWord?: (word: string) => void, k: number, columns: number}) {
    const {currentWord:word, setCurrentWord:setWord, notValid, setNotValid} = useKeyBoardLetters()

    useEffect(()=>{
        const handler = (e: KeyboardEvent) => {
            if(word.length < columns && e.key.match(/^[a-zA-Z]$/)){
                setWord(prev=>prev+e.key.toUpperCase())
                if(notValid){
                    setNotValid(false)
                }
            }
            else if(addWord && e.key === 'Enter' && word.length === columns){
                if(WordsList.includes(word.toLowerCase())){
                    addWord(word)
                    setWord('')
                }else{
                    setNotValid(true)
                }
            }
            else if(e.key === 'Backspace' && word.length > 0){
                setWord(prev=>prev.slice(0, -1))
                if(notValid){
                    setNotValid(false)
                }
            }
        }

        window.addEventListener('keydown', handler)

        return ()=>{
            window.removeEventListener('keydown', handler)
        }
    },[word, addWord, columns, notValid, setWord, setNotValid])

    return(
        <div className="flex gap-2">
            {
                Array.from({ length: columns }, (_, i) => (
                    <motion.div animate={word.length === i + 1 && !notValid ? {
                        scale:[1, 1.2, 1],
                    } : {
                        borderColor: notValid ? 'rgba(255, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                        scale: notValid?[1, 1.1, 1]: undefined,
                    }} initial={{scale: 1}} transition={{duration: 0.5}} 
                    key={`${k}-${i}`} 
                    className="size-14 text-2xl font-bold rounded-sm border border-opacity-70 flex justify-center items-center">
                        {word.length > i ? word[i] : ""}
                    </motion.div>
                ))
            }
        </div>
    )
}

export function StaticBordRow({
    word,
    k,
    result,
    columns,
}:{
    word?: string | null,
    k: number,
    result?:string[],
    columns: number
}) {
    

    return(
        <div className="flex gap-2">
            {
                Array.from({ length: columns }, (_, i) => (
                    <div key={`${k}-${i}`}>
                    {word ? 
                        <motion.div 
                            animate={{
                                backgroundColor: result ? ['rgba(0, 0, 0, 0)',result[i] === 'G'? 'rgba(22, 163, 74, 0.7)' : result[i] === 'R'? 'rgba(75, 85, 99, 0.7)': result[i] === 'Y'? 'rgba(245, 158, 11, 0.7)': 'rgba(0, 0, 0, 0)'] : undefined,
                                rotateX:[0,90,0]
                            }}
                            transition={
                                {
                                    duration: 0.4,
                                    delay: i * 0.3,
                                }
                            }
                            className="size-14 text-2xl font-bold rounded-sm border border-opacity-70 flex justify-center items-center">
                            {word[i]}
                        </motion.div>:
                        <div className="size-14 text-2xl font-bold rounded-sm border border-opacity-70 flex justify-center items-center"/>
                    }
                    </div>
                ))
            }
        </div>
    )
}