const WIN_LINES=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
let choices=document.querySelectorAll(".button");
let turn=true;              // true = X (player 1 / you), false = O (player 2 / computer)
let vsComputer=false;
let difficulty="medium";
let locked=false;
let gameId=0;
let gameOver=false;
let decision_text=document.querySelector("#decision_text");
let decision=document.querySelector(".decision");
let reset=document.querySelector("#reset");

let boardFull=()=>[...choices].every(b=>b.innerText!="");
let showDraw=()=>{
    decision_text.innerText="It's a draw";
    decision.classList.remove("hidden");
}
let emptyBoard=()=>{
    choices.forEach((button)=>{
        choices[button.id].innerText="";
    })
    decision.classList.add("hidden");
}
let enableButtons=()=>{
    choices.forEach(btn => btn.disabled = false);
}
reset.addEventListener("click",()=>{
    emptyBoard();
    enableButtons();
    gameOver=false;
    gameId++;
    locked=false;
    turn=true;
})
let setScoreColor=(UserChoice,turn)=>{
    if(turn) choices[UserChoice].style.color="red";
    else choices[UserChoice].style.color="green";
}
let showResult=(turn)=>{
    decision_text.innerText=vsComputer ? (turn?"You win!":"Computer wins") : `Player-${turn?1:2} wins`;
    decision.classList.remove("hidden");
}
let winnerFound=(turn)=>{
    gameOver=true;
    choices.forEach(btn => btn.disabled = true);
    showResult(turn);
}
let checkWinner=(turn)=>{
    WIN_LINES.forEach((el)=>{
        let first=choices[el[0]].innerText,second=choices[el[1]].innerText,third=choices[el[2]].innerText;
        if(first!="" && second!="" && third!=""){
            if(first==second && second==third){
                winnerFound(turn);
            }
        }
    })
}
let playGame=(UserChoice,turn)=>{
    choices[UserChoice].innerText=turn?"X":"O";
    setScoreColor(UserChoice,turn);
    checkWinner(turn);
}

// ===== Computer player (plays O) =====
let winnerOn=(b)=>{
    for(const [x,y,z] of WIN_LINES){
        if(b[x] && b[x]==b[y] && b[y]==b[z]) return b[x];
    }
    return null;
}
let minimax=(b,isO)=>{
    const w=winnerOn(b);
    if(w=="O") return 1;
    if(w=="X") return -1;
    if(b.every(c=>c)) return 0;
    let best=isO?-2:2;
    for(let i=0;i<9;i++){
        if(b[i]) continue;
        b[i]=isO?"O":"X";
        const s=minimax(b,!isO);
        b[i]="";
        best=isO?Math.max(best,s):Math.min(best,s);
    }
    return best;
}
let computerMove=async()=>{
    const id=gameId;
    locked=true;
    await GameKit.sleep(500);
    if(id!==gameId) return;
    const b=[...choices].map(x=>x.innerText);
    const empty=[];
    b.forEach((v,i)=>{ if(!v) empty.push(i); });
    let move;
    if(GameKit.playsWell(difficulty)){
        let best=-2,bestMoves=[];
        for(const i of empty){
            b[i]="O";
            const s=minimax(b,false);
            b[i]="";
            if(s>best){ best=s; bestMoves=[i]; }
            else if(s==best) bestMoves.push(i);
        }
        move=GameKit.pick(bestMoves);
    }else{
        move=GameKit.pick(empty);
    }
    playGame(move,false);
    if(!gameOver && boardFull()) showDraw();
    turn=!turn;
    choices[move].disabled=true;
    locked=false;
}

GameKit.modeBar(document.querySelector(".mode_bar"),(m)=>{
    vsComputer=m.vsComputer;
    difficulty=m.difficulty;
    reset.click();
});
choices.forEach((button)=>{
    button.addEventListener("click",()=>{
        if(locked) return;
        playGame(button.id,turn);
        if(!gameOver && boardFull()) showDraw();
        turn=!turn;
        button.disabled=true;
        if(vsComputer && !turn && !gameOver && !boardFull()) computerMove();
    })
});
