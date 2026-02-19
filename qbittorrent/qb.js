import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import dotenv from "dotenv";
dotenv.config();

const jar = new CookieJar();

export const qb = wrapper(axios.create({
  baseURL: process.env.QBITIP,
  jar,
  withCredentials: true
}));

export async function loginQB() {
  await qb.post("/api/v2/auth/login", 
    new URLSearchParams({
      username: process.env.BITUSER,
      password: process.env.QBITPASS
    })
  );
}

export async function addMagnet(magnet) {

  const today = new Date().toISOString().split("T")[0]; 

  await qb.post("/api/v2/torrents/add",
    new URLSearchParams({
      urls: magnet,
      category: "2tbEnglish",
      tags: `malayalam,script,${today}`
        // optional
    })
  );
}
