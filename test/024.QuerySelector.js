"use strict";
document.querySelector("div.class-a");
document.querySelector("div.class-a.class-b");
document.querySelector("div.user-panel.main input[name=login]");
document.querySelector(`
    div.class-a
    div.class-b
`);
document.querySelector("#id-a");
document.querySelector("div#id-a");

document.querySelectorAll("div.class-a");
document.querySelectorAll("*");
document.querySelectorAll(`${classes}`);

document.getElementById("id-a");
document.getElementsByClassName("class-a class-b");
document.getElementsByName("name-a");
