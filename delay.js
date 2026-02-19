

export async function delay(ms,noLog) {
  if(noLog){
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  else{
console.log(`Waiting...${ms} sec`);
  return new Promise(resolve => setTimeout(resolve, ms));
  }
   
}