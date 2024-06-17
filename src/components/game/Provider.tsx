"use client"

import { useContext, createContext, useState } from "react"

type letters = {letter: string, type: "right" | "wrong" | "missPlaced"}[]

const KeyBoardLettersContext = createContext<{
    AddLetters:([])=>void,
    rightLetters: string[],
    wrongLetters: string[],
    missPlacedLetters: string[],
    setCurrentWord: React.Dispatch<React.SetStateAction<string>>,
    currentWord: string,
    notValid: boolean,
    setNotValid: React.Dispatch<React.SetStateAction<boolean>>
}>({
    AddLetters: (letters:letters)=>{},
    rightLetters: [],
    wrongLetters: [],
    missPlacedLetters: [],
    setCurrentWord: () => {},
    currentWord: "",
    notValid: false,
    setNotValid: () => {}
})

export function useKeyBoardLetters() {
    return useContext(KeyBoardLettersContext)
}

export function KeyBoardLettersProvider({children}: {children: React.ReactNode}){
    const [rightLetters, setRightLetters] = useState<string[]>([])
    const [wrongLetters, setWrongLetters] = useState<string[]>([])
    const [missPlacedLetters, setMissPlacedLetters] = useState<string[]>([])

    const [currentWord, setCurrentWord] = useState<string>("")
    const [notValid, setNotValid] = useState(false);

    const AddLetters = (letters:letters) => {
        letters.forEach(({letter, type}) => {
            if(type === "right"){
                setRightLetters(prev => [...prev, letter])
            }
            else if(type === "wrong"){
                setWrongLetters(prev => [...prev, letter])
            }
            else if(type === "missPlaced"){
                setMissPlacedLetters(prev => [...prev, letter])
            }
        })
    }

    return (
        <KeyBoardLettersContext.Provider value={{AddLetters, rightLetters, wrongLetters, missPlacedLetters, setCurrentWord, currentWord, notValid, setNotValid}}>
            {children}
        </KeyBoardLettersContext.Provider>
    )
}