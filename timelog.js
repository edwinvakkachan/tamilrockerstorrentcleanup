import { publishMessage } from "./queue/publishMessage.js";


export async function log(message='⌚') {
  const time = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false
  });


    await publishMessage({
  message: `[${time}] ${message}`
});
  console.log(`[${time}] ${message}`);
}
