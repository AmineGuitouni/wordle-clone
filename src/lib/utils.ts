import { createCipheriv, createDecipheriv } from 'crypto';
import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const algorithm = 'aes-256-cbc';

export function encrypt(text:string, keyS:string, ivS:string) {
    const key = Buffer.from(keyS, 'hex');
    const iv = Buffer.from(ivS, 'hex');

    const cipher = createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return encrypted
}

export default function decrypt(encryptedData:string, keyS:string, ivS:string) {
    const key = Buffer.from(keyS, 'hex');
    const iv = Buffer.from(ivS, 'hex');

    const decipher = createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted
}