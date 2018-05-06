import { NgModule } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonicPageModule } from 'ionic-angular';

import { PipesModule } from '../../pipes/pipes.module'

import { HistoryPage } from './history';

@NgModule({
  declarations: [
    HistoryPage,
  ],
  imports: [
    IonicPageModule.forChild(HistoryPage),
    TranslateModule.forChild(),
    PipesModule,
  ],
  exports: [
    HistoryPage
  ]
})
export class HistoryPageModule { }
