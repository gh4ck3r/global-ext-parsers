"use strict";
for (let i=0;i<10;  i); // i is ForStatement.update
for (let i=0;i<10; +i); // i is UnaryExpression.argument
for (let i=0;i<10;++i); // i is UpdateExpression.argument
let i=0;
for (i=0;i<10;++i);
// ignore variable defined in for statement
