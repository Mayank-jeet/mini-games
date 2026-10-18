let player_score=document.querySelector("#player_score");
let computer_score=document.querySelector("#computer_score");
let result_text=document.querySelector("#result_text");
let reload=document.querySelector(".reset");
let cScore=0;
let pScore=0;
let setScoreColor=((cScore,pScore)=>{
    if(cScore===pScore){
        computer_score.style.color='';      // back to the theme text color
        player_score.style.color='';
    }else if(cScore>pScore){
        computer_score.style.color='green';
        player_score.style.color='red';
    }else{
        computer_score.style.color='red';
        player_score.style.color='green';
    }
});
let reloadGame=("click",()=>{
    cScore=0;
    pScore=0;
    player_score.innerText=pScore;
    computer_score.innerText=cScore;
    result_text.innerText=`Decision Pending...`;
    setScoreColor(cScore,pScore);
});
reload.addEventListener("click",()=>{
    reloadGame();
})
let updateStatus=((score,compChoice,userChoice)=>{
    if(score==1){
        pScore++;
        result_text.innerText=`You Won!, ${userChoice} beats ${compChoice}`;
        player_score.innerText=pScore;
    }else{
        cScore++;
        result_text.innerText=`You Lose!, ${compChoice} beats ${userChoice}`;
        computer_score.innerText=cScore;
    }
    setScoreColor(cScore,pScore)
});
let choices=['rock','paper','scissor'];
let playGame=((userChoice)=>{
    let compChoice=GameKit.pick(choices);
    let score=0;
    if(compChoice===userChoice){
        result_text.innerText=`Both choose ${compChoice}`;
        return;
    }else if(userChoice==='rock'){
        score= compChoice==='scissor'? 1:0;
    }else if(userChoice==='paper'){
        score= compChoice==='rock'? 1:0;
    }else{
        score= compChoice==='paper'? 1:0;
    }
    updateStatus(score,compChoice,userChoice);
});
document.querySelectorAll(".choice .input").forEach(div => {
    div.addEventListener("click", () => {
        let userChoice = div.id;
        playGame(userChoice);   
    });
});