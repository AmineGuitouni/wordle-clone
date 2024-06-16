import {AuthOptions} from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { FirestoreAdapter } from "@auth/firebase-adapter";
import { cert } from "firebase-admin/app"

export const authOptions:AuthOptions = {
    // @ts-ignore
    adapter: FirestoreAdapter({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g,'\n'),
        })
      }),
    providers:[
        GoogleProvider({
            clientId: process.env.GOOGLE_ID as string,
            clientSecret: process.env.GOOGLE_SECRET as string
        }),
    ],
    session:{
        strategy: "jwt",
    },
    secret: process.env.NEXTAUTH_SECRET,
}