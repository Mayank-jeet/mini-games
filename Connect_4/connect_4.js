let columns=document.querySelectorAll(".column");
let arr=[[-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1]];
let red=true;
let moves=0;
let vsComputer=false;
let difficulty="medium";
let locked=false;
let gameOver=false;
let gameId=0;
let reset_botton=document.querySelector(".reset");
let removeColor=()=>{
    let red_box=document.querySelectorAll(".red_color");
    let blue_box=document.querySelectorAll(".blue_color");
    for(let el of red_box){
        el.classList.remove("red_color");
    }
    for(let el of blue_box){
        el.classList.remove("blue_color");
    }
}
let resetGame=()=>{
    arr=[[-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1],
        [-1,-1,-1,-1,-1,-1,-1]];
    red=true;
    moves=0;
    gameOver=false;
    gameId++;
    locked=false;
    document.querySelector(".result").classList.add("hidden");
    removeColor();
}
let setColor=(idx,red)=>{
    let el=document.getElementById(idx);
    if(red) el.classList.add("red_color");
    else el.classList.add("blue_color");
}
let setInArr=(idx,red)=>{
    let row=idx[0]-'0';
    let col=idx[1]-'0';
    if(red) arr[row][col]=1;
    else arr[row][col]=0;
}
let hzCheck=(idx,val)=>{
    let count=0;
    for(let i=0;i<7;i++){
        if(arr[idx][i]==val) count++;
        else count=0;
        if(count==4) return true;
    }
    return false;
}
let vrCheck=(idx,val)=>{
    let count=0;
    for(let i=0;i<6;i++){
        if(arr[i][idx]==val) count++;
        else count=0;
        if(count==4) return true;
    }
    return false;
}
let diaCheck=(idx,val)=>{
    let row=idx[0]-'0';
    let col=idx[1]-'0';
    let i=row,j=col,count=0;
    while(i>=0 && j>=0 && arr[i][j]==val){
        count++;
        i--;
        j--;
    }
    i=row+1;
    j=col+1;
    while(i<6 && j<7 && arr[i][j]==val){
        count++;
        i++;
        j++;
    }
    return count>=4;
}
let offDiaCheck=(idx,val)=>{
    let row=idx[0]-'0';
    let col=idx[1]-'0';
    let i=row,j=col,count=0;
    while(i>=0 && j<7 && arr[i][j]==val){
        count++;
        i--;
        j++;
    }
    i=row+1;
    j=col-1;
    while(i<6 && j>=0 && arr[i][j]==val){
        count++;
        i++;
        j--;
    }
    return count>=4;
}
let checkWinner=(idx,red)=>{
    let val;
    if(red) val=1;
    else val=0;
    return hzCheck(idx[0]-'0',val) || vrCheck(idx[1]-'0',val) || diaCheck(idx,val) || offDiaCheck(idx,val);
}
let  winner=(red)=>{
    document.querySelector(".result").classList.remove("hidden");
    document.querySelector("#result_text").innerText=vsComputer ? (red?"YOU WON!":"COMPUTER WON") : `${red?"RED":"BLUE"} PLAYER WON`;
    gameOver=true;
}
let getIndex=(element,red)=>{
    let idx;
    for(let i=5;i>=0;i--){
        if(arr[i][element.id[1]-'0']==-1){
            idx=i;
            break;
        }
    }
    if(idx===undefined) return null;
    return idx+element.id[1];
}
let fillBox=(element,red)=>{
    let idx=getIndex(element);
    if(idx===null) return false;
    setColor(idx,red);
    setInArr(idx,red);
    moves++;
    if(checkWinner(idx,red)) winner(red);
    else if(moves==42){
        document.querySelector(".result").classList.remove("hidden");
        document.querySelector("#result_text").innerText="IT'S A DRAW";
        gameOver=true;
    }
    return true;
}
for(let column of columns){
    column.addEventListener("click",()=>{
        if(locked || gameOver) return;
        if(fillBox(column.children[0],red)){
            red=!red;
            if(vsComputer && !red && !gameOver) computerMove();
        }
    });
}
// ===== Computer player (plays blue, never cheats: same rules, real board only) =====
let AI=0,HUMAN=1;
let validCols=(b)=>[0,1,2,3,4,5,6].filter(c=>b[0][c]==-1);
let dropRow=(b,c)=>{
    for(let r=5;r>=0;r--){
        if(b[r][c]==-1) return r;
    }
    return -1;
}
let lines4=[];
for(let r=0;r<6;r++){
    for(let c=0;c<7;c++){
        for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
            const er=r+3*dr, ec=c+3*dc;
            if(er<0||er>5||ec<0||ec>6) continue;
            lines4.push([0,1,2,3].map(k=>[r+k*dr,c+k*dc]));
        }
    }
}
let hasFour=(b,v)=>lines4.some(w=>w.every(([r,c])=>b[r][c]==v));
let evaluate=(b)=>{
    let score=0;
    for(let r=0;r<6;r++){
        if(b[r][3]==AI) score+=3;
        else if(b[r][3]==HUMAN) score-=3;
    }
    for(const w of lines4){
        let a=0,h=0;
        for(const [r,c] of w){
            if(b[r][c]==AI) a++;
            else if(b[r][c]==HUMAN) h++;
        }
        if(a>0 && h>0) continue;
        if(a==3) score+=6; else if(a==2) score+=2;
        if(h==3) score-=7; else if(h==2) score-=2;
    }
    return score;
}
let c4search=(b,depth,alpha,beta,maxing)=>{
    if(hasFour(b,AI)) return 1000000+depth;
    if(hasFour(b,HUMAN)) return -1000000-depth;
    const cols=validCols(b).sort((x,y)=>Math.abs(3-x)-Math.abs(3-y));
    if(cols.length==0) return 0;
    if(depth==0) return evaluate(b);
    if(maxing){
        let best=-Infinity;
        for(const c of cols){
            const r=dropRow(b,c);
            b[r][c]=AI;
            best=Math.max(best,c4search(b,depth-1,alpha,beta,false));
            b[r][c]=-1;
            alpha=Math.max(alpha,best);
            if(alpha>=beta) break;
        }
        return best;
    }
    let best=Infinity;
    for(const c of cols){
        const r=dropRow(b,c);
        b[r][c]=HUMAN;
        best=Math.min(best,c4search(b,depth-1,alpha,beta,true));
        b[r][c]=-1;
        beta=Math.min(beta,best);
        if(alpha>=beta) break;
    }
    return best;
}
let pickColumn=()=>{
    const b=arr.map(row=>row.slice());
    const cols=validCols(b);
    if(difficulty=="easy") return GameKit.pick(cols);
    const depth=difficulty=="hard"?5:3;
    let best=-Infinity,bestCols=[];
    for(const c of cols){
        const r=dropRow(b,c);
        b[r][c]=AI;
        const s=c4search(b,depth-1,-Infinity,Infinity,false);
        b[r][c]=-1;
        if(s>best){ best=s; bestCols=[c]; }
        else if(s==best) bestCols.push(c);
    }
    return GameKit.pick(bestCols);
}
let computerMove=async()=>{
    const id=gameId;
    locked=true;
    await GameKit.sleep(500);
    if(id!==gameId) return;
    const col=pickColumn();
    fillBox(document.getElementById("0"+col),red);
    red=!red;
    locked=false;
}
GameKit.modeBar(document.querySelector(".mode_bar"),(m)=>{
    vsComputer=m.vsComputer;
    difficulty=m.difficulty;
    resetGame();
});
reset_botton.addEventListener("click",()=>{
    resetGame();
})