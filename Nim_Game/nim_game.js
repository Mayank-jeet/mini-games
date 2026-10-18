let playing_area=document.querySelectorAll(".playing_area img");
let player1=true;
let vsComputer=false;
let difficulty="medium";
let locked=false;
let gameId=0;
let count=0;
let loopCount=0;
let turn_text=document.querySelector("#turn_text");
let result_text=document.querySelector("#result_text");
let reset_button=document.querySelector("#reset_button");
let result=document.querySelector(".result");
let end_btn=document.querySelector("#end_turn");
// END TURN is only usable after taking at least 1 stick, on a human turn, while the game is running
let refreshEnd=()=>{
    end_btn.disabled = loopCount==0 || count==25 || locked;
}
// Shared by the END TURN button and the Enter key
let endTurn=()=>{
    if(loopCount==0 || count==25 || locked) return;
    loopCount=0;
    changePlayer();
}
end_btn.addEventListener("click",endTurn);
let winner=()=>{
    result_text.innerText=vsComputer ? (player1?"You won!":"Computer won") : `Player ${player1?1:2} won`;
    result.classList.remove("hidden");
}
let changePlayer=()=>{
    player1=!player1;
    turn_text.innerText=vsComputer ? (player1?"YOUR TURN":"COMPUTER'S TURN") : `PLAYER ${player1?1:2} TURN`;
    if(vsComputer && !player1 && count<25) computerTurn();
    refreshEnd();
}
let removerFunction=(e)=>{
    count++;
    loopCount++;
    refreshEnd();
    e.classList.add("hidden");
    e.style.pointerEvents = "none";
    if(count==25){
        winner();
        return;
    }
    if(loopCount==3){
        loopCount=0;
        changePlayer();
    }

}
for(let el of playing_area){
    el.addEventListener("click",(e)=>{
        if(locked) return;
        removerFunction(e.target);
    });
}
let reset=()=>{
    for(let el of playing_area){
        el.style.pointerEvents = "auto";
        el.classList.remove("hidden")
    }
    count=0;
    loopCount=0;
    gameId++;
    locked=false;
    player1=false;
    result.classList.add("hidden");
    changePlayer();
}
const sleep=GameKit.sleep;
let computerTurn=async()=>{
    const id=gameId;
    locked=true;
    await sleep(700);
    if(id!==gameId) return;
    const remaining=25-count;
    const randomTake=()=>1+GameKit.rand(Math.min(3,remaining));
    let n;
    if(GameKit.playsWell(difficulty)){
        n=remaining%4; // leave a multiple of 4 sticks
        if(n==0) n=randomTake();
    }else{
        n=randomTake();
    }
    for(let i=0;i<n;i++){
        const available=[...playing_area].filter(el=>!el.classList.contains("hidden"));
        const pick=GameKit.pick(available);
        removerFunction(pick);
        if(count==25) return; // computer took the last stick and won
        if(i<n-1){
            await sleep(450);
            if(id!==gameId) return;
        }
    }
    if(loopCount>0){
        loopCount=0;
        changePlayer();
    }
    locked=false;
}
GameKit.modeBar(document.querySelector(".mode_bar"),(m)=>{
    vsComputer=m.vsComputer;
    difficulty=m.difficulty;
    reset();
});
reset_button.addEventListener("click",()=>{
    reset();
});
document.addEventListener("keydown",(e)=>{
    if(e.key=="Enter"){
        endTurn();
    }
});
