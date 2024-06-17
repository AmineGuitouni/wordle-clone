"use server"

import { WordsList } from "./constants"
import decrypt from "./utils"

export const CheckWord = async ({word, encryptedWord}:{word: string, encryptedWord: string})=>{
    if(!word || word.length !== 5) {
        throw new Error('Word must be 5 characters long')
    }

    let randomWord = decrypt(encryptedWord, process.env.ENCREPTION_KEY!, process.env.ENCREPTION_IV!)
    if(!WordsList.includes(randomWord.toLowerCase())){
        throw new Error('Word not found')
    }
    const win = randomWord === word
    let colors = ['R', 'R', 'R', 'R', 'R']

    console.log("1")
    for (let i = 0; i < 5; i++) {
        if (word[i] === randomWord[i]) {
            colors[i] = 'G'
            randomWord = randomWord.substring(0, i) + '_' + randomWord.substring(i + 1)
            console.log(randomWord, colors)
        }
    }
    console.log("2")
    for (let i = 0; i < 5; i++) {
        if (randomWord.includes(word[i])) {
            colors[i] = 'Y'
            randomWord = randomWord.replace(word[i], '_')
        }
        console.log(randomWord, colors)
    }



    return {colors, win}
}