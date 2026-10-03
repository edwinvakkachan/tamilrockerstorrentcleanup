import axios from "axios";

const QBIT_URL = process.env.QBITIP || "http://localhost:8080";
const QBIT_USERNAME = process.env.QBITUSER || "admin";
const QBIT_PASSWORD = process.env.QBITPASS || "adminadmin";

export async function sortDownloadingTorrentsAlphabetically() {
    const client = axios.create({
        baseURL: QBIT_URL,
        withCredentials: true,
    });

    try {
        // ============================================================
        // LOGIN
        // ============================================================

        const loginResponse = await client.post(
            "/api/v2/auth/login",
            new URLSearchParams({
                username: QBIT_USERNAME,
                password: QBIT_PASSWORD,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        if (loginResponse.data !== "Ok.") {
            throw new Error(`qBittorrent login failed: ${loginResponse.data}`);
        }

        console.log("✅ Logged into qBittorrent");

        // ============================================================
        // GET DOWNLOADING TORRENTS
        // ============================================================

        const response = await client.get("/api/v2/torrents/info", {
            params: {
                filter: "downloading",
                sort: "name",
                reverse: false,
            },
        });

        const torrents = response.data;

        console.log("");
        console.log("=================================================");
        console.log("📂 DOWNLOADING TORRENTS - ALPHABETICAL ORDER");
        console.log("=================================================");

        if (!torrents.length) {
            console.log("No downloading torrents found.");
            return;
        }

        torrents.forEach((torrent, index) => {
            console.log(
                `${String(index + 1).padStart(3, " ")}. ${torrent.name}`
            );
        });

        console.log("");
        console.log(`Total downloading torrents: ${torrents.length}`);

    } catch (error) {
        console.error(
            "❌ Error:",
            error.response?.data || error.message
        );
    }
}

