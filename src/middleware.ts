import { getToken } from "next-auth/jwt";
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

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

export default withAuth(
  async function middleware(req) {
    const token = await getToken({ req });
    
    const pathName = req.nextUrl.pathname
    
    if(pathName.startsWith("/api")){
      return null
    }

    if(!token && pathName !== "/"){
      return NextResponse.redirect(new URL(authanticationPage, req.url))
    }
    if(token && pathName === authanticationPage){
      return NextResponse.redirect(new URL("/game", req.url))
    }
  },
  {
    callbacks: {
      authorized() {
        return true
      },
    },
  }
)

export const config = {
    matcher:["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"]
}