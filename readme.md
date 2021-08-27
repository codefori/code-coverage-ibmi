# IBM i Code Coverage for Visual Studio Code

This code coverage extension depends on [Code for IBM i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi). Installing this will require that extension and install it automatically.

## Setup

1. Install this extension
2. Make sure you have `CODECOV` installed. [See slide 28 here from IBM for PTF information](https://www.ibm.com/support/pages/system/files/inline-files/Command%20Line%20Code%20Coverage.pdf).
3. Make sure `QDEVTOOLS` in on your library list if not installed into QGPL.

## The basics

```rpgle
**FREE

// test1.rpgle

Dcl-s anumber int(5);

anumber = 5;

if (anumber = 10);
  dsply 'The number is 10!';
else;
  if (anumber = 5);
    //This is the only DSPLY that should execute.
    dsply 'The number is 5!';
  else;
    dsply 'The number is not 5!';
  endif;
endif;

Return;
```

You can right-click on most types of sources to create a new Coverage Test. In this case, I called my source member `test1.rpgle`, and right-clicking on it shows that you can create a new Coverage Test. Upon clicking that menu item, a new wizard will appear when you can enter information about the test—mostly prefilled. You can leave it as the defaults and save it.

If you head over to the Code Coverage extension tab, you will see your newly created test there. When you click on it, it will run the test in the background. As it runs you will see the spinning icon, which indicates it is running. When the test is finished running, it will show you all the results of the test. The results include a list of sources that the Coverage Test ran across and what percentage of that code was executed. You are able to click on a source to show the coverage line-by-line.

## How to include other programs 

Right now, you can only run coverage tests directly on specific programs. Instead of specifying many other programs or service programs, we let the user provide a binding directory when creating the coverage test and the extension will automatically include all service programs in that directory in the coverage test.

# Pull requests

We are PR friendly. Due to the nature of the complexity in IBM i Code Coverage, please reach out to us outside of this repository for us to take a look at your issue.