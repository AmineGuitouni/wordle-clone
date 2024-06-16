"use client"

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function ActiveBordRow({addWord, k, columns}: {addWord?: (word: string) => void, k: number, columns: number}) {
    const [word, setWord] = useState<string>("");

    useEffect(()=>{
        const handler = (e: KeyboardEvent) => {
            console.log(word)
            if(word.length < columns && e.key.match(/^[a-zA-Z]$/)){
                setWord(prev=>prev+e.key.toUpperCase())
            }
            else if(addWord && e.key === 'Enter' && word.length === columns){
                addWord(word)
                setWord('')
            }
            else if(e.key === 'Backspace' && word.length > 0){
                setWord(prev=>prev.slice(0, -1))
            }
        }

        window.addEventListener('keydown', handler)

        return ()=>{
            window.removeEventListener('keydown', handler)
        }
    },[word, addWord,columns])

    return(
        <div className="flex gap-2">
            {
                Array.from({ length: columns }, (_, i) => (
                    <motion.div animate={word.length === i + 1 ? {
                        scale:[1, 1.2, 1]
                    } : {}} initial={{scale: 1}} transition={{duration: 0.5}} 
                    key={`${k}-${i}`} 
                    className="size-16 text-2xl font-bold rounded-sm border border-opacity-70 flex justify-center items-center">
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
                            className="size-16 text-2xl font-bold rounded-sm border border-opacity-70 flex justify-center items-center">
                            {word[i]}
                        </motion.div>:
                        <div className="size-16 text-2xl font-bold rounded-sm border border-opacity-70 flex justify-center items-center"/>
                    }
                    </div>
                ))
            }
        </div>
    )
}