"use client"

import { Button } from "@nextui-org/react"
import { signIn } from "next-auth/react"
import { FaGoogle } from "react-icons/fa"

export default function LoginWithGoogleBtn({text, color, className}:{text?:string, color?:"primary" | "default" | "secondary" | "success" | "warning" | "danger", className?:string}) {

    return (
        <Button
            className={className}
            radius="full"
            onClick={() => signIn("google")}
            color={color? color:"primary"}
            variant="solid"
            size="md">
                {text? text:<><FaGoogle/> Login with Google</>}
            </Button>
    )
}