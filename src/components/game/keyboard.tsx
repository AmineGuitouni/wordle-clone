"use client"

import { Button } from "@nextui-org/react"
import { useKeyBoardLetters } from "./Provider"
import { AiOutlineEnter } from "react-icons/ai";
import { IoBackspaceOutline } from "react-icons/io5";
import { WordsList } from "@/lib/constants";
import { useEffect, useState } from "react";
import { useScreenSize } from "@/hooks/useScreenSize";
import { cn } from "@/lib/utils";

const Letters = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
]
export default function Keyboard({AddWord}: {AddWord?: (word: string) => void}) {
    const {setCurrentWord, currentWord, notValid, setNotValid, rightLetters, wrongLetters, missPlacedLetters} = useKeyBoardLetters()

    const {sm} = useScreenSize()

    return (
        <div className="flex flex-col gap-2 items-center mt-[10%]">
            <div className={cn("flex", sm ? "gap-1" : "gap-2")}>
                {
                    Letters[0].map((letter, index) => (
                        <Button
                            radius='sm'
                            isDisabled={wrongLetters.includes(letter)}
                            color={rightLetters.includes(letter) ? "success" : missPlacedLetters.includes(letter) ? "warning" : undefined}
                            key={index}
                            isIconOnly
                            size={sm ? "sm" : "md"}
                            onPress={() => {
                                if(currentWord.length < 5){
                                    setCurrentWord(prev => prev + letter)
                                }
                                if(notValid){
                                    setNotValid(false)
                                }
                            }}
                            className="text-lg font-bold"
                        >
                            {letter}
                        </Button>
                    ))
                }
            </div>
            <div className={cn("flex", sm ? "gap-1" : "gap-2")}>
                {
                    Letters[1].map((letter, index) => (
                        <Button
                            radius='sm'
                            isDisabled={wrongLetters.includes(letter)}
                            color={rightLetters.includes(letter) ? "success" : missPlacedLetters.includes(letter) ? "warning" : undefined}
                            key={index + 50}
                            isIconOnly
                            size={sm ? "sm" : "md"}
                            className="text-lg font-bold"
                            onPress={() => {
                                if(currentWord.length < 5){
                                    setCurrentWord(prev => prev + letter)
                                }
                                if(notValid){
                                    setNotValid(false)
                                }
                            }}
                        >
                            {letter}
                        </Button>
                    ))
                }
            </div>
            <div className={cn("flex", sm ? "gap-1" : "gap-2")}>
                <Button
                    radius='sm'
                    size={sm ? "sm" : "md"}
                    onPress={() => {
                        if(currentWord.length > 0){
                            setCurrentWord(prev => prev.slice(0, -1))
                        }
                        if(notValid){
                            setNotValid(false)
                        }
                    }}
                    className="text-2xl"
                >
                    <IoBackspaceOutline />
                </Button>
                {
                    Letters[2].map((letter, index) => (
                        <Button
                            radius='sm'
                            isDisabled={wrongLetters.includes(letter)}
                            color={rightLetters.includes(letter) ? "success" : missPlacedLetters.includes(letter) ? "warning" : undefined}
                            key={index + 100}
                            isIconOnly
                            size={sm ? "sm" : "md"}
                            onPress={() =>{
                                if(currentWord.length < 5){
                                    setCurrentWord(prev => prev + letter)
                                }
                                if(notValid){
                                    setNotValid(false)
                                }
                            }}
                            className="text-lg font-bold"
                        >
                            {letter}
                        </Button>
                    ))
                }
                <Button
                    radius='sm'
                    size={sm ? "sm" : "md"}
                    onPress={() => {
                        if(AddWord && WordsList.includes(currentWord.toLowerCase())){
                            AddWord(currentWord)
                        }
                        else{
                            setNotValid(true)
                        }
                    }}
                    className="text-2xl"
                >
                    <AiOutlineEnter/>
                </Button>
            </div>
        </div>
    )
}