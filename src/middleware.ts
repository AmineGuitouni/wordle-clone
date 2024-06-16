import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const pagetKanAuth:string[] = [
]

const authanticationPage = "/"

function checkLink(link:string, list:string[]){
    for(let i = 0; i < list.length; i++){
        if(link.startsWith(list[i])){
            return true
        }
    }
    return false
}

export default async function middleware(req:NextRequest) {
  const token = await getToken({ req });
    
    const pathName = req.nextUrl.pathname
    
    if(pathName.startsWith("/api")){
      return NextResponse.next()
    }

    if(!token && pathName !== "/"){
      return NextResponse.redirect(new URL(authanticationPage, req.url))
    }
    if(token && pathName === authanticationPage){
      return NextResponse.redirect(new URL("/game", req.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher:["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"]
}